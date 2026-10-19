import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApplication } from "../src/app.js";
import { allModels, LiveGameRoom, MatchResult, User } from "../src/models.js";
import { seedContent } from "../src/content.js";
import type { RoomState, GameId } from "@duo-clash/shared";
let mongo: MongoMemoryReplSet;
const apps: ReturnType<typeof createApplication>[] = [];
let sequence = 0;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function account() {
  const n = ++sequence;
  const response = await request(apps[0].app)
    .post("/api/v1/auth/register")
    .send({
      displayName: "Durable " + n,
      username: "durable_" + n,
      email: "durable_" + n + "@example.test",
      password: "durable-test-password",
    });
  expect(response.status).toBe(201);
  return {
    cookie: response.headers["set-cookie"][0].split(";")[0],
    id: response.body.user.id,
  };
}
async function action(
  index: number,
  cookie: string,
  event: string,
  payload: unknown = {},
) {
  return request(apps[index].app)
    .post("/api/v1/realtime/command")
    .set("Cookie", cookie)
    .set("Origin", "http://localhost:5173")
    .send({ event, payload });
}
async function sync(index: number, cookie: string): Promise<RoomState | null> {
  const response = await request(apps[index].app)
    .get("/api/v1/realtime/state")
    .set("Cookie", cookie);
  expect(response.status).toBe(200);
  return response.body.room;
}
async function until(
  cookie: string,
  condition: (room: RoomState) => boolean,
  timeout = 15000,
): Promise<RoomState> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const room = await sync(2, cookie);
    if (room && condition(room)) return room;
    await delay(25);
  }
  throw new Error("Durable state did not reach the expected phase");
}
const settings = (gameId: GameId, maxPlayers = 1) => ({
  name: "Durable match",
  gameIds: [gameId],
  rounds: 1,
  maxPlayers,
  duration: 15,
  ranked: false,
  category: "All",
});
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(mongo.getUri("duo_durable_tests"));
  await Promise.all(allModels.map((model) => model.init()));
  await seedContent();
  for (let i = 0; i < 3; i++)
    apps.push(
      createApplication({
        durableRooms: true,
        timing: { starting: 25, results: 35 },
      }),
    );
}, 120000);
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
describe("durable multiplayer across independent API instances", () => {
  it("requires authentication and advertises the deployed transport", async () => {
    expect(
      (await request(apps[0].app).get("/api/v1/realtime/state")).status,
    ).toBe(401);
    expect(
      (await request(apps[0].app).get("/api/v1/health")).body.transport,
    ).toBe("http");
  });
  it("allows one current room per player under concurrent creates", async () => {
    const player = await account();
    const results = await Promise.all([
      action(0, player.cookie, "room:create", settings("word-blitz")),
      action(1, player.cookie, "room:create", settings("word-blitz")),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(await LiveGameRoom.countDocuments({ memberIds: player.id })).toBe(1);
    expect((await action(2, player.cookie, "room:leave")).status).toBe(200);
  });
  it("serializes competing joins and enforces host control and capacity", async () => {
    const [host, a, b] = await Promise.all([account(), account(), account()]);
    const created = await action(
      0,
      host.cookie,
      "room:create",
      settings("word-blitz", 2),
    );
    const code = created.body.room.code;
    const joins = await Promise.all([
      action(1, a.cookie, "room:join", { code }),
      action(2, b.cookie, "room:join", { code }),
    ]);
    expect(joins.filter((result) => result.status === 200)).toHaveLength(1);
    const guest = joins[0].status === 200 ? a : b;
    const state = await sync(2, host.cookie);
    expect(state!.players).toHaveLength(2);
    expect(state!.players.every((player) => player.connected)).toBe(true);
    expect((await action(1, guest.cookie, "match:start")).status).toBe(403);
    await action(1, guest.cookie, "room:leave");
    await action(0, host.cookie, "room:leave");
  });
  for (const game of [
    "quick-quiz",
    "memory-rush",
    "word-blitz",
    "reflex-race",
  ] as GameId[]) {
    it(
      "plays " + game + " across instances and saves its result exactly once",
      async () => {
        const player = await account();
        const created = await action(
          0,
          player.cookie,
          "room:create",
          settings(game),
        );
        expect(created.status).toBe(200);
        const code = created.body.room.code;
        expect((await action(1, player.cookie, "match:start")).status).toBe(
          200,
        );
        let playing = await until(
          player.cookie,
          (room) => room.status === "playing",
        );
        const privateRoom = await LiveGameRoom.findById(code).lean();
        const secret = privateRoom!.snapshot.secret;
        expect(playing.challenge).not.toHaveProperty("answer");
        expect(playing).not.toHaveProperty("snapshot");
        let value = secret.answer;
        if (game === "memory-rush") {
          await delay(
            Math.max(0, secret.challenge.showUntil - Date.now() + 40),
          );
          playing = (await sync(0, player.cookie))!;
          expect(playing.challenge).not.toHaveProperty("sequence");
        }
        if (game === "reflex-race") {
          expect(playing.challenge).not.toHaveProperty("signalAt");
          await delay(Math.max(0, secret.signalAt - Date.now() + 100));
          value = "tap";
        }
        const payload = { code, roundId: playing.challenge!.id, value };
        const answers = await Promise.all([
          action(0, player.cookie, "answer:submit", payload),
          action(1, player.cookie, "answer:submit", payload),
        ]);
        expect(answers.filter((answer) => answer.status === 200)).toHaveLength(
          1,
        );
        const completed = await until(
          player.cookie,
          (room) => room.status === "completed",
        );
        expect(completed.persisted).toBe(true);
        expect(completed.results[0].scores[0].correct).toBe(true);
        expect(completed.players[0].score).toBeGreaterThanOrEqual(100);
        const points = (await User.findById(player.id))!.points;
        await Promise.all([
          sync(0, player.cookie),
          sync(1, player.cookie),
          sync(2, player.cookie),
        ]);
        expect(
          await MatchResult.countDocuments({ matchId: completed.id }),
        ).toBe(1);
        expect((await User.findById(player.id))!.points).toBe(points);
        expect((await action(1, player.cookie, "match:rematch")).status).toBe(
          200,
        );
        const rematch = (await sync(0, player.cookie))!;
        expect(rematch.status).toBe("waiting");
        expect(rematch.id).not.toBe(completed.id);
        expect(rematch.results).toEqual([]);
        expect(rematch.players[0].score).toBe(0);
        await action(2, player.cookie, "room:leave");
      },
    );
  }
  it("restores a room after every original API instance has been closed", async () => {
    const player = await account();
    const created = await action(
      0,
      player.cookie,
      "room:create",
      settings("word-blitz"),
    );
    await Promise.all(apps.splice(0).map((app) => app.close()));
    for (let i = 0; i < 3; i++)
      apps.push(
        createApplication({
          durableRooms: true,
          timing: { starting: 25, results: 35 },
        }),
      );
    const restored = await sync(2, player.cookie);
    expect(restored!.code).toBe(created.body.room.code);
    expect(restored!.hostId).toBe(player.id);
    expect((await action(1, player.cookie, "room:leave")).status).toBe(200);
  });
});
