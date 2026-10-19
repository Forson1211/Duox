import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApplication } from "../src/app.js";
import {
  allModels,
  LiveGameRoom,
  MatchResult,
  Match,
  User,
} from "../src/models.js";
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
    instanceOpts: [{ launchTimeout: 60000 }],
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
    "number-circuit",
    "code-breaker",
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
        // The last answer saves immediately, even if every player closes the tab.
        const accepted = answers.find((answer) => answer.status === 200)!;
        expect(accepted.body.room.persisted).toBe(true);
        expect(
          await MatchResult.countDocuments({ matchId: accepted.body.room.id }),
        ).toBe(1);
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
  it("catches up missed deadlines without granting another answer window", async () => {
    const player = await account();
    const created = await action(0, player.cookie, "room:create", {
      ...settings("word-blitz"),
      rounds: 2,
    });
    await action(1, player.cookie, "match:start");
    await LiveGameRoom.updateOne(
      { _id: created.body.room.code },
      { $set: { "snapshot.nextAt": Date.now() - 120000 } },
    );
    const completed = await sync(2, player.cookie);
    expect(completed!.status).toBe("completed");
    expect(completed!.results).toHaveLength(2);
    expect(
      completed!.results.every((round) => round.scores[0].points === 0),
    ).toBe(true);
    expect(completed!.persisted).toBe(true);
    expect(await MatchResult.countDocuments({ matchId: completed!.id })).toBe(
      1,
    );
    await action(0, player.cookie, "room:leave");
  });
  it("previews permitted room details without exposing players or private challenges", async () => {
    const host = await account(),
      guest = await account();
    const created = await action(
      0,
      host.cookie,
      "room:create",
      settings("code-breaker", 2),
    );
    const path = "/api/v1/rooms/" + created.body.room.code + "/preview";
    expect((await request(apps[1].app).get(path)).status).toBe(401);
    const preview = await request(apps[2].app)
      .get(path)
      .set("Cookie", guest.cookie);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      playerCount: 1,
      canJoin: true,
      settings: { gameIds: ["code-breaker"] },
    });
    expect(Object.keys(preview.body).sort()).toEqual([
      "canJoin",
      "code",
      "playerCount",
      "settings",
      "status",
    ]);
    await request(apps[1].app)
      .post("/api/v1/blocks")
      .set("Cookie", host.cookie)
      .send({ userId: guest.id });
    expect(
      (await request(apps[2].app).get(path).set("Cookie", guest.cookie)).status,
    ).toBe(403);
    await action(0, host.cookie, "room:leave");
  });
  for (const game of ["memory-rush", "reflex-race"] as const) {
    it(
      "freezes and restores all " + game + " clocks across instances",
      async () => {
        const player = await account();
        const created = await action(
          0,
          player.cookie,
          "room:create",
          settings(game),
        );
        const code = created.body.room.code;
        await action(0, player.cookie, "match:start");
        const playing = await until(
          player.cookie,
          (r) => r.status === "playing",
        );
        const before = (await LiveGameRoom.findById(code).lean())!.snapshot
          .secret;
        expect((await action(1, player.cookie, "room:pause")).status).toBe(200);
        expect((await sync(2, player.cookie))!.status).toBe("paused");
        expect(
          (
            await action(2, player.cookie, "answer:submit", {
              code,
              roundId: playing.challenge!.id,
              value: before.answer,
            })
          ).status,
        ).toBe(400);
        const shifts: Record<string, number> = {
          "snapshot.pause.at": -60000,
          "snapshot.secret.challenge.startedAt": -60000,
          "snapshot.secret.challenge.deadline": -60000,
        };
        if (game === "memory-rush")
          shifts["snapshot.secret.challenge.showUntil"] = -60000;
        else shifts["snapshot.secret.signalAt"] = -60000;
        await LiveGameRoom.updateOne({ _id: code }, { $inc: shifts });
        expect((await sync(0, player.cookie))!.status).toBe("paused");
        const resumed = await action(2, player.cookie, "room:resume");
        expect(resumed.status).toBe(200);
        expect(resumed.body.room.status).toBe("playing");
        const after = (await LiveGameRoom.findById(code).lean())!.snapshot
          .secret;
        expect(after.challenge.deadline).toBeGreaterThan(Date.now());
        expect(after.challenge.deadline - after.challenge.startedAt).toBe(
          before.challenge.deadline - before.challenge.startedAt,
        );
        if (game === "memory-rush")
          expect(after.challenge.showUntil - after.challenge.startedAt).toBe(
            before.challenge.showUntil - before.challenge.startedAt,
          );
        else {
          expect(after.signalAt - after.challenge.startedAt).toBe(
            before.signalAt - before.challenge.startedAt,
          );
          expect(resumed.body.room.challenge).not.toHaveProperty("signalAt");
        }
        await action(0, player.cookie, "room:leave");
      },
    );
  }
  it("resumes the countdown instead of skipping the first round", async () => {
    const player = await account();
    await action(0, player.cookie, "room:create", settings("code-breaker"));
    await action(0, player.cookie, "match:start");
    const room = await sync(1, player.cookie);
    // Isolated timing is short; use the private snapshot to test a paused countdown deterministically.
    await LiveGameRoom.updateOne(
      { _id: room!.code },
      {
        $set: {
          "snapshot.status": "starting",
          "snapshot.round": 0,
          "snapshot.nextAt": Date.now() + 3000,
        },
      },
    );
    expect(
      (await action(1, player.cookie, "room:pause")).body.room.pause.phase,
    ).toBe("starting");
    const resumed = await action(2, player.cookie, "room:resume");
    expect(resumed.body.room.status).toBe("starting");
    expect(resumed.body.room.round).toBe(0);
    await action(0, player.cookie, "room:leave");
  });
  it("restarts from round one with a new match id and no stale scores", async () => {
    const host = await account(),
      guest = await account();
    const created = await action(0, host.cookie, "room:create", {
      ...settings("number-circuit", 2),
      rounds: 2,
    });
    const code = created.body.room.code;
    await action(1, guest.cookie, "room:join", { code });
    await action(1, guest.cookie, "room:ready", { ready: true });
    await action(0, host.cookie, "match:start");
    const playing = await until(host.cookie, (r) => r.status === "playing");
    const answer = (await LiveGameRoom.findById(code).lean())!.snapshot.secret
      .answer;
    await action(1, host.cookie, "answer:submit", {
      code,
      roundId: playing.challenge!.id,
      value: answer,
    });
    expect((await action(2, guest.cookie, "match:restart")).status).toBe(403);
    expect(
      (await action(2, guest.cookie, "match:restart-request")).status,
    ).toBe(200);
    expect((await sync(0, host.cookie))!.restartRequestedBy).toBe(guest.id);
    await action(1, guest.cookie, "room:pause");
    expect((await action(2, host.cookie, "match:restart")).status).toBe(200);
    const restarted = await until(host.cookie, (r) => r.status === "playing");
    expect(restarted.id).not.toBe(playing.id);
    expect(restarted.round).toBe(1);
    expect(restarted.challenge!.gameId).toBe("number-circuit");
    expect(restarted.results).toEqual([]);
    expect(restarted.submitted).toEqual([]);
    expect(restarted.players.every((p) => p.score === 0)).toBe(true);
    expect(restarted.pause).toBeUndefined();
    expect(restarted.persisted).toBe(false);
    expect((await Match.findById(playing.id))!.status).toBe("cancelled");
    expect(await MatchResult.countDocuments({ matchId: playing.id })).toBe(0);
    await action(0, host.cookie, "room:leave");
    await action(1, guest.cookie, "room:leave");
  });
  it("lets a guest quit an active match without trapping the other player or inventing a result", async () => {
    const host = await account(),
      guest = await account();
    const created = await action(0, host.cookie, "room:create", {
      ...settings("code-breaker", 2),
      ranked: true,
    });
    const code = created.body.room.code;
    await action(1, guest.cookie, "room:join", { code });
    await action(1, guest.cookie, "room:ready", { ready: true });
    await action(0, host.cookie, "match:start");
    await until(host.cookie, (r) => r.status === "playing");
    expect((await action(1, guest.cookie, "match:cancel")).status).toBe(403);
    expect((await action(2, guest.cookie, "room:leave")).status).toBe(200);
    expect(await sync(0, guest.cookie)).toBeNull();
    const cancelled = (await sync(1, host.cookie))!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.players).toHaveLength(1);
    expect(cancelled.cancelReason).toContain("left the match");
    expect(await MatchResult.countDocuments({ matchId: cancelled.id })).toBe(0);
    expect((await User.findById(host.id))!.matches).toBe(0);
    expect(
      (await action(2, guest.cookie, "room:create", settings("word-blitz")))
        .status,
    ).toBe(200);
    await action(1, guest.cookie, "room:leave");
    expect((await action(2, host.cookie, "match:restart")).status).toBe(200);
    expect((await sync(1, host.cookie))!.status).toBe("waiting");
    expect((await action(0, guest.cookie, "room:join", { code })).status).toBe(
      200,
    );
    await action(1, guest.cookie, "room:leave");
    await action(0, host.cookie, "room:leave");
  });
  it("delivers authenticated chat once across instances and restores the conversation", async () => {
    const host = await account(),
      guest = await account(),
      outsider = await account();
    const created = await action(
      0,
      host.cookie,
      "room:create",
      settings("code-breaker", 2),
    );
    const code = created.body.room.code;
    await action(1, guest.cookie, "room:join", { code });
    expect(
      (
        await action(2, outsider.cookie, "chat:send", {
          code,
          text: "Intruder",
        })
      ).status,
    ).toBe(404);
    expect(
      (await action(1, host.cookie, "chat:send", { code, text: "   " })).status,
    ).toBe(400);
    const id = randomUUID();
    expect(
      (
        await action(0, host.cookie, "chat:send", {
          code,
          id,
          text: "Hello from host",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await action(1, host.cookie, "chat:send", {
          code,
          id,
          text: "Hello from host",
        })
      ).status,
    ).toBe(200);
    const received = (await sync(2, guest.cookie))!.chatMessages!;
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id,
      userId: host.id,
      text: "Hello from host",
    });
    const reply = await action(2, guest.cookie, "chat:send", {
      code,
      id: randomUUID(),
      text: "Hello back",
      userId: host.id,
    });
    expect(reply.status).toBe(200);
    expect(reply.body.data.userId).toBe(guest.id);
    expect((await sync(0, host.cookie))!.chatMessages).toHaveLength(2);
    expect(
      (
        await action(1, host.cookie, "chat:send", {
          code: "DUO-ZZZZZZ",
          text: "Wrong room",
        })
      ).status,
    ).toBe(403);
    await Promise.all(apps.splice(0).map((app) => app.close()));
    for (let i = 0; i < 3; i++)
      apps.push(
        createApplication({
          durableRooms: true,
          timing: { starting: 25, results: 35 },
        }),
      );
    expect(
      (await sync(2, guest.cookie))!.chatMessages!.map((m) => m.text),
    ).toEqual(["Hello from host", "Hello back"]);
    expect((await action(0, host.cookie, "match:cancel")).status).toBe(200);
    expect((await sync(2, guest.cookie))!.status).toBe("cancelled");
    expect(
      (await action(1, guest.cookie, "chat:send", { code, text: "Ended" }))
        .status,
    ).toBe(400);
    await action(0, host.cookie, "room:leave");
    await action(1, guest.cookie, "room:leave");
  });
  it("keeps completed results while a restarted match earns a fresh result", async () => {
    const player = await account();
    const created = await action(
      0,
      player.cookie,
      "room:create",
      settings("number-circuit"),
    );
    const code = created.body.room.code;
    await action(0, player.cookie, "match:start");
    let id = "";
    let points = 0;
    for (let run = 0; run < 2; run++) {
      const playing = await until(player.cookie, (r) => r.status === "playing");
      const doc = await LiveGameRoom.findById(code).lean();
      await action(1, player.cookie, "answer:submit", {
        code,
        roundId: playing.challenge!.id,
        value: doc!.snapshot.secret.answer,
      });
      const completed = await until(
        player.cookie,
        (r) => r.status === "completed",
      );
      expect(completed.persisted).toBe(true);
      expect((await User.findById(player.id))!.matches).toBe(run + 1);
      if (run === 0) {
        id = completed.id;
        points = (await User.findById(player.id))!.points;
        expect((await action(2, player.cookie, "match:restart")).status).toBe(
          200,
        );
      } else {
        expect(completed.id).not.toBe(id);
        expect((await User.findById(player.id))!.points).toBeGreaterThan(
          points,
        );
        expect((await Match.findById(id))!.status).toBe("completed");
      }
    }
    await action(0, player.cookie, "room:leave");
  });
});
