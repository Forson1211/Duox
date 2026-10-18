import { newRound } from "../src/games.js";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvents,
  ServerEvents,
  RoomState,
  RoomSettings,
  Reply,
} from "@duo-clash/shared";
import { createApplication } from "../src/app.js";
import { seedContent } from "../src/content.js";
import {
  allModels,
  User,
  Question,
  Match,
  MatchResult,
  Session,
  ResetToken,
  ChallengeCompletion,
} from "../src/models.js";
import { dailyInfo } from "../src/rooms.js";
let mongo: MongoMemoryReplSet;
let app: ReturnType<typeof createApplication>;
let url: string;
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
const settings: RoomSettings = {
  name: "Integration clash",
  gameIds: ["quick-quiz"],
  rounds: 1,
  maxPlayers: 2,
  duration: 15,
  ranked: true,
  category: "All",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(
  fn: () => T | Promise<T>,
  check: (v: T) => boolean,
  timeout = 20000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (check(value)) return value;
    await sleep(30);
  }
  throw new Error("Condition timed out.");
}
async function register(n: string) {
  const result = await request(app.app)
    .post("/api/v1/auth/register")
    .send({
      displayName: n,
      username: n,
      email: n + "@example.test",
      password: "a-strong-test-password",
    });
  expect(result.status).toBe(201);
  const cookie = result.headers["set-cookie"][0].split(";")[0];
  return { cookie, user: result.body.user };
}
async function connect(cookie: string) {
  const s: Socket<ServerEvents, ClientEvents> = io(url, {
    extraHeaders: { Cookie: cookie, Origin: "http://localhost:5173" },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
function emit<T>(
  s: Socket<ServerEvents, ClientEvents>,
  event: keyof ClientEvents,
  data: unknown,
): Promise<Reply<T>> {
  return new Promise((resolve, reject) => {
    (s.timeout(10000).emit as Function)(
      event,
      data,
      (error: Error | null, result: Reply<T>) =>
        error ? reject(error) : resolve(result),
    );
  });
}
function room(code: string) {
  return app.rooms.state(app.rooms.rooms.get(code)!);
}
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(mongo.getUri("duo_clash_integration"));
  await Promise.all(allModels.map((m) => m.init()));
  await seedContent();
  app = createApplication({ timing: { starting: 50, results: 80 } });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
}, 120000);
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  if (app) await app.close();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}, 30000);
describe("real database, API, and socket integration", () => {
  it("registers accounts, rejects duplicates, uses protected cookie sessions and logout", async () => {
    const a = await register("authplayer");
    expect(a.user).not.toHaveProperty("passwordHash");
    expect(
      await User.findById(a.user.id)
        .select("+passwordHash")
        .then((u) => u!.passwordHash),
    ).not.toContain("a-strong-test-password");
    expect(
      (
        await request(app.app).post("/api/v1/auth/register").send({
          displayName: "Duplicate",
          username: "AUTHPLAYER",
          email: "different@example.test",
          password: "a-strong-test-password",
        })
      ).status,
    ).toBe(409);
    expect((await request(app.app).get("/api/v1/users/me")).status).toBe(401);
    expect(
      (
        await request(app.app)
          .post("/api/v1/auth/login")
          .send({ email: "authplayer@example.test", password: "wrong" })
      ).status,
    ).toBe(401);
    const login = await request(app.app).post("/api/v1/auth/login").send({
      email: "authplayer@example.test",
      password: "a-strong-test-password",
    });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(login.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(
      (await request(app.app).get("/api/v1/auth/me").set("Cookie", a.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app.app)
          .post("/api/v1/auth/logout")
          .set("Cookie", a.cookie)
      ).status,
    ).toBe(200);
    expect(
      (await request(app.app).get("/api/v1/auth/me").set("Cookie", a.cookie))
        .status,
    ).toBe(401);
  });
  it("rejects untrusted origins and unauthorized admin access", async () => {
    const a = await register("originplayer");
    expect(
      (
        await request(app.app)
          .post("/api/v1/auth/login")
          .set("Origin", "https://evil.example")
          .send({
            email: "originplayer@example.test",
            password: "a-strong-test-password",
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.app)
          .get("/api/v1/admin/questions")
          .set("Cookie", a.cookie)
      ).status,
    ).toBe(403);
  });
  it("expires sessions and consumes password-reset tokens once", async () => {
    const a = await register("resetplayer");
    const result = await request(app.app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "resetplayer@example.test" });
    expect(result.status).toBe(200);
    const token = new URL(result.body.developmentResetUrl).searchParams.get(
      "token",
    );
    expect(
      (
        await request(app.app)
          .post("/api/v1/auth/reset-password")
          .send({ token, password: "my-new-strong-password" })
      ).status,
    ).toBe(200);
    expect(
      (await request(app.app).get("/api/v1/auth/me").set("Cookie", a.cookie))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app.app)
          .post("/api/v1/auth/reset-password")
          .send({ token, password: "another-strong-password" })
      ).status,
    ).toBe(400);
    const login = await request(app.app).post("/api/v1/auth/login").send({
      email: "resetplayer@example.test",
      password: "my-new-strong-password",
    });
    expect(login.status).toBe(200);
    await Session.updateMany({ userId: a.user.id }, { expiresAt: new Date(0) });
    expect(
      (
        await request(app.app)
          .get("/api/v1/auth/me")
          .set("Cookie", login.headers["set-cookie"][0].split(";")[0])
      ).status,
    ).toBe(401);
  });
  it("plays a synchronized ranked match, rejects duplicates, restores reconnects and persists once", async () => {
    const a = await register("hostplayer");
    const b = await register("rivalplayer");
    const stranger = await register("strangerplayer");
    const sa = await connect(a.cookie);
    let sb = await connect(b.cookie);
    const sc = await connect(stranger.cookie);
    let latestA: RoomState | null = null;
    let latestB: RoomState | null = null;
    sa.on("room:state", (r) => (latestA = r));
    sb.on("room:state", (r) => (latestB = r));
    const created = await emit<RoomState>(sa, "room:create", settings);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    const code = created.data.code;
    expect(code).toMatch(/^DUO-[A-Z2-9]{6}$/);
    expect((await emit(sb, "room:join", { code: "DUO-AAAAAA" })).ok).toBe(
      false,
    );
    expect((await emit(sb, "room:join", { code })).ok).toBe(true);
    expect((await emit(sc, "room:join", { code })).ok).toBe(false);
    expect((await emit(sb, "match:start", {})).ok).toBe(false);
    expect((await emit(sa, "match:start", {})).ok).toBe(false);
    expect(
      (
        await request(app.app)
          .get("/api/v1/matches/" + created.data.id)
          .set("Cookie", stranger.cookie)
      ).status,
    ).toBe(404);
    await emit(sa, "room:ready", { ready: true });
    await emit(sb, "room:ready", { ready: true });
    expect((await emit(sa, "match:start", {})).ok).toBe(true);
    await until(
      () => room(code),
      (r) => r.status === "playing",
    );
    const state = room(code);
    const question = await Question.findOne({
      prompt: state.challenge!.prompt,
    });
    expect(state.challenge).not.toHaveProperty("answer");
    expect(state.challenge).not.toHaveProperty("correctAnswerIndex");
    sb.disconnect();
    await until(
      () => room(code),
      (r) => !r.players.find((p) => p.id === b.user.id)!.connected,
    );
    sb = await connect(b.cookie);
    sb.on("room:state", (r) => (latestB = r));
    const sync = await emit<RoomState>(sb, "room:sync", {});
    expect(sync.ok).toBe(true);
    if (sync.ok) expect(sync.data.challenge?.id).toBe(state.challenge!.id);
    const payload = {
      code,
      roundId: state.challenge!.id,
      value: question!.answer,
    };
    expect((await emit(sa, "answer:submit", payload)).ok).toBe(true);
    expect((await emit(sa, "answer:submit", payload)).ok).toBe(false);
    expect((await emit(sc, "answer:submit", payload)).ok).toBe(false);
    expect(
      (
        await emit(sb, "answer:submit", {
          ...payload,
          value: (question!.answer + 1) % 4,
        })
      ).ok,
    ).toBe(true);
    const done = await until(
      () => room(code),
      (r) => r.status === "completed",
    );
    expect(done.persisted).toBe(true);
    expect(done.winnerIds).toEqual([a.user.id]);
    expect(done.ratingChanges[a.user.id]).toBe(16);
    expect(done.ratingChanges[b.user.id]).toBe(-16);
    expect(await MatchResult.countDocuments({ matchId: done.id })).toBe(2);
    const points = (await User.findById(a.user.id))!.points;
    await app.rooms.persist(app.rooms.rooms.get(code)!);
    await app.rooms.persist(app.rooms.rooms.get(code)!);
    expect((await User.findById(a.user.id))!.points).toBe(points);
    expect(await MatchResult.countDocuments({ matchId: done.id })).toBe(2);
    expect((latestA as RoomState | null)?.status).toBe("completed");
    await until(
      () => latestB,
      (r) => r?.status === "completed",
    );
    const leaders = await request(app.app).get("/api/v1/leaderboards/weekly");
    expect(
      leaders.body.leaders.some((p: { id: string }) => p.id === a.user.id),
    ).toBe(true);
    await emit(sa, "room:leave", {});
    expect(room(code).winnerIds).toEqual([a.user.id]);
    expect(room(code).players).toHaveLength(2);
    expect(room(code).hostId).toBe(b.user.id);
    expect((await emit(sb, "match:rematch", {})).ok).toBe(true);
    expect(room(code).status).toBe("waiting");
    expect(room(code).id).not.toBe(done.id);
    expect(room(code).results).toEqual([]);
    expect((await emit(sa, "room:join", { code })).ok).toBe(true);
    // The host is automatically ready in a new lobby; returning guests confirm.
    expect(
      room(code).players.every(
        (p) => p.score === 0 && p.ready === (p.id === room(code).hostId),
      ),
    ).toBe(true);
    expect((await emit(sa, "answer:submit", payload)).ok).toBe(false);
    await emit(sb, "room:leave", {});
    expect(room(code).hostId).toBe(a.user.id);
    await emit(sa, "room:leave", {});
  }, 30000);
  it("plays the remaining three games through the shared lifecycle", async () => {
    const a = await register("allgamesplayer");
    const s = await connect(a.cookie);
    for (const game of ["memory-rush", "word-blitz", "reflex-race"] as const) {
      const result = await emit<RoomState>(s, "room:create", {
        ...settings,
        gameIds: [game],
        maxPlayers: 1,
        ranked: false,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      const code = result.data.code;
      await emit(s, "room:ready", { ready: true });
      await emit(s, "match:start", {});
      let r = await until(
        () => room(code),
        (r) => r.status === "playing",
      );
      const secret = app.rooms.rooms.get(code)!.secret!;
      let value: unknown;
      if (game === "memory-rush") {
        value = r.challenge!.sequence;
        expect(
          (
            await emit(s, "answer:submit", {
              code,
              roundId: r.challenge!.id,
              value,
            })
          ).ok,
        ).toBe(false);
        await until(
          () => Date.now(),
          (n) => n >= r.challenge!.showUntil! + 20,
        );
        r = room(code);
        expect(r.challenge).not.toHaveProperty("sequence");
      }
      if (game === "word-blitz")
        value = (secret.answer as string).toLowerCase();
      if (game === "reflex-race") {
        value = "tap";
        expect(r.challenge).not.toHaveProperty("signalAt");
        await until(
          () => Date.now(),
          (n) => n >= secret.signalAt! + 150,
        );
      }
      expect(
        (
          await emit(s, "answer:submit", {
            code,
            roundId: r.challenge!.id,
            value,
          })
        ).ok,
      ).toBe(true);
      const done = await until(
        () => room(code),
        (r) => r.status === "completed",
      );
      expect(done.players[0].score).toBeGreaterThanOrEqual(100);
      expect(done.ratingChanges[a.user.id]).toBe(0);
      expect(await MatchResult.countDocuments({ matchId: done.id })).toBe(1);
      await emit(s, "room:leave", {});
    }
  }, 40000);
  it("expires unanswered rounds without trusting the client clock", async () => {
    const a = await register("timeoutplayer");
    const s = await connect(a.cookie);
    const result = await emit<RoomState>(s, "room:create", {
      ...settings,
      maxPlayers: 1,
      ranked: false,
    });
    if (!result.ok) throw new Error(result.error);
    const code = result.data.code;
    await emit(s, "room:ready", { ready: true });
    await emit(s, "match:start", {});
    await until(
      () => room(code),
      (r) => r.status === "playing",
    );
    const live = app.rooms.rooms.get(code)!;
    live.secret!.challenge.deadline = Date.now() - 1;
    expect(
      (
        await emit(s, "answer:submit", {
          code,
          roundId: live.secret!.challenge.id,
          value: 0,
        })
      ).ok,
    ).toBe(false);
    const done = await until(
      () => room(code),
      (r) => r.status === "completed",
    );
    expect(done.players[0].score).toBe(0);
    expect(done.results[0].scores[0].detail).toBe("No answer");
    await emit(s, "room:leave", {});
  });
  it("persists daily rewards once, friend requests and block restrictions", async () => {
    const a = await register("socialplayer");
    const b = await register("socialrival");
    const f = await request(app.app)
      .post("/api/v1/friends/requests")
      .set("Cookie", a.cookie)
      .send({ username: b.user.username });
    expect(f.status).toBe(201);
    expect(
      (
        await request(app.app)
          .post(`/api/v1/friends/requests/${f.body.request._id}/accept`)
          .set("Cookie", a.cookie)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.app)
          .post(`/api/v1/friends/requests/${f.body.request._id}/accept`)
          .set("Cookie", b.cookie)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.app)
          .get("/api/v1/leaderboards/friends")
          .set("Cookie", a.cookie)
      ).body.leaders,
    ).toHaveLength(2);
    expect(
      (
        await request(app.app)
          .post("/api/v1/blocks")
          .set("Cookie", a.cookie)
          .send({ userId: b.user.id })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.app)
          .post("/api/v1/friends/requests")
          .set("Cookie", b.cookie)
          .send({ username: a.user.username })
      ).status,
    ).toBe(403);
    const sa = await connect(a.cookie);
    const sb = await connect(b.cookie);
    const c = await emit<RoomState>(sa, "room:create", {
      ...settings,
      ranked: false,
    });
    if (!c.ok) throw new Error(c.error);
    expect((await emit(sb, "room:join", { code: c.data.code })).ok).toBe(false);
    await emit(sa, "room:leave", {});
    const d = dailyInfo();
    for (let attempt = 0; attempt < 2; attempt++) {
      const c = await emit<RoomState>(sa, "room:create", {
        ...settings,
        gameIds: [d.gameId],
        maxPlayers: 1,
        ranked: false,
      });
      if (!c.ok) throw new Error(c.error);
      const r = app.rooms.rooms.get(c.data.code)!;
      r.results = [
        {
          round: 1,
          gameId: d.gameId,
          answer: "test fixture",
          scores: [
            {
              userId: a.user.id,
              points: 100,
              correct: true,
              detail: "Correct",
            },
          ],
        },
      ];
      r.members.get(a.user.id)!.score = 100;
      await app.rooms.persist(r);
      r.status = "completed";
      await emit(sa, "room:leave", {});
    }
    expect(
      await ChallengeCompletion.countDocuments({
        userId: a.user.id,
        day: d.day,
      }),
    ).toBe(1);
    expect((await User.findById(a.user.id))!.points).toBe(400);
    expect(
      (
        await request(app.app)
          .get("/api/v1/challenges/daily")
          .set("Cookie", a.cookie)
      ).body.completed,
    ).toBe(true);
  });
  it("keeps private profiles out of public rankings and supports moderation", async () => {
    const a = await register("privateplayer");
    const admin = await register("adminplayer");
    await User.updateOne({ _id: admin.user.id }, { role: "admin" });
    expect(
      (
        await request(app.app)
          .patch("/api/v1/users/me")
          .set("Cookie", a.cookie)
          .send({ visibility: "private" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.app)
          .get("/api/v1/users/privateplayer")
          .set("Cookie", admin.cookie)
      ).status,
    ).toBe(404);
    const all = await request(app.app).get("/api/v1/leaderboards/global");
    expect(
      all.body.leaders.some((p: { id: string }) => p.id === a.user.id),
    ).toBe(false);
    const report = await request(app.app)
      .post("/api/v1/reports")
      .set("Cookie", a.cookie)
      .send({
        targetId: admin.user.id,
        category: "other",
        description: "Integration report fixture",
      });
    expect(report.status).toBe(201);
    expect(
      (
        await request(app.app)
          .get("/api/v1/admin/reports")
          .set("Cookie", admin.cookie)
      ).body.reports,
    ).toHaveLength(1);
    expect(
      (
        await request(app.app)
          .patch("/api/v1/admin/users/" + a.user.id)
          .set("Cookie", admin.cookie)
          .send({ status: "suspended" })
      ).status,
    ).toBe(200);
    expect(
      (await request(app.app).get("/api/v1/users/me").set("Cookie", a.cookie))
        .status,
    ).toBe(401);
  });
  it("serializes simultaneous creates and does not overfill concurrent joins", async () => {
    const host = await register("racehost");
    const one = await register("raceone");
    const two = await register("racetwo");
    const sh = await connect(host.cookie);
    const same = await connect(host.cookie);
    const attempts = await Promise.all([
      emit<RoomState>(sh, "room:create", { ...settings, ranked: false }),
      emit<RoomState>(same, "room:create", { ...settings, ranked: false }),
    ]);
    expect(attempts.filter((a) => a.ok)).toHaveLength(1);
    const successful = attempts.find((a) => a.ok)!;
    if (!successful.ok) throw new Error(successful.error);
    const code = successful.data.code;
    const s1 = await connect(one.cookie);
    const s2 = await connect(two.cookie);
    const joined = await Promise.all([
      emit(s1, "room:join", { code }),
      emit(s2, "room:join", { code }),
    ]);
    expect(joined.filter((a) => a.ok)).toHaveLength(1);
    expect(room(code).players).toHaveLength(2);
    const live = app.rooms.rooms.get(code)!;
    live.expiresAt = Date.now() - 1;
    await until(
      () => app.rooms.rooms.has(code),
      (exists) => !exists,
    );
    expect(app.rooms.membership.has(host.user.id)).toBe(false);
    expect((await Match.findById(successful.data.id))!.status).toBe(
      "cancelled",
    );
  });
  it("supports admin content, rejects role escalation, and deletes personal accounts", async () => {
    const regular = await register("deleteplayer");
    const admin = await register("contentadmin");
    await User.updateOne({ _id: admin.user.id }, { role: "admin" });
    expect(
      (
        await request(app.app)
          .patch("/api/v1/users/me")
          .set("Cookie", regular.cookie)
          .send({ role: "admin" })
      ).status,
    ).toBe(400);
    const question = {
      category: "Custom category",
      prompt: "How many days are in a standard week?",
      options: ["Five", "Six", "Seven", "Eight"],
      answer: 2,
      explanation: "A standard week has seven days.",
      active: true,
    };
    expect(
      (
        await request(app.app)
          .post("/api/v1/admin/questions")
          .set("Cookie", regular.cookie)
          .send(question)
      ).status,
    ).toBe(403);
    const created = await request(app.app)
      .post("/api/v1/admin/questions")
      .set("Cookie", admin.cookie)
      .send(question);
    expect(created.status).toBe(201);
    expect(
      (await request(app.app).get("/api/v1/categories")).body.categories,
    ).toContain("Custom category");
    expect(
      (
        await request(app.app)
          .patch("/api/v1/admin/questions/" + created.body.question._id)
          .set("Cookie", admin.cookie)
          .send({ active: false })
      ).status,
    ).toBe(200);
    expect(
      (await request(app.app).get("/api/v1/categories")).body.categories,
    ).not.toContain("Custom category");
    expect(
      (
        await request(app.app)
          .delete("/api/v1/users/me")
          .set("Cookie", regular.cookie)
          .send({ password: "wrong-password" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.app)
          .delete("/api/v1/users/me")
          .set("Cookie", regular.cookie)
          .send({ password: "a-strong-test-password" })
      ).status,
    ).toBe(200);
    expect(await User.exists({ _id: regular.user.id })).toBeNull();
    expect(
      (
        await request(app.app)
          .get("/api/v1/auth/me")
          .set("Cookie", regular.cookie)
      ).status,
    ).toBe(401);
  });
  it("retains completed results and rankings across application restart", async () => {
    const total = await MatchResult.countDocuments();
    expect(total).toBeGreaterThan(0);
    const before = await request(app.app).get("/api/v1/leaderboards/weekly");
    expect(before.status).toBe(200);
    await app.close();
    app = createApplication({ timing: { starting: 50, results: 80 } });
    await new Promise<void>((resolve) =>
      app.server.listen(0, "127.0.0.1", resolve),
    );
    const after = await request(app.app).get("/api/v1/leaderboards/weekly");
    expect(after.body).toEqual(before.body);
    expect(await MatchResult.countDocuments()).toBe(total);
    expect(app.rooms.rooms.size).toBe(0);
  });
  it("does not repeat quiz questions before exhausting the active bank", async () => {
    const prompts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const next = await newRound(
        "quick-quiz",
        i + 1,
        15,
        "All",
        Date.now(),
        prompts,
      );
      expect(prompts).not.toContain(next.challenge.prompt);
      prompts.push(next.challenge.prompt);
    }
  });
  it("searches real players literally and keeps their absolute rank and personal standing", async () => {
    const a = await register("ranksearch");
    const b = await register("rankleader");
    await User.updateOne(
      { _id: a.user.id },
      { points: 50000, displayName: "Nova.Test" },
    );
    await User.updateOne({ _id: b.user.id }, { points: 60000 });
    const all = await request(app.app)
      .get("/api/v1/leaderboards/global")
      .set("Cookie", a.cookie);
    expect(all.status).toBe(200);
    expect(all.body.currentPlayer.id).toBe(a.user.id);
    expect(all.body.currentPlayer.rank).toBe(2);
    const found = await request(app.app)
      .get("/api/v1/leaderboards/global?q=RANKSEARCH")
      .set("Cookie", a.cookie);
    expect(found.body.leaders).toHaveLength(1);
    expect(found.body.leaders[0].rank).toBe(2);
    expect(found.body.currentPlayer.rank).toBe(2);
    expect(found.body.leaders[0]).not.toHaveProperty("email");
    expect(found.body.leaders[0]).not.toHaveProperty("passwordHash");
    const literal = await request(app.app)
      .get("/api/v1/leaderboards/global")
      .query({ q: ".+" });
    expect(literal.status).toBe(200);
    expect(literal.body.total).toBe(0);
    const dot = await request(app.app)
      .get("/api/v1/leaderboards/global")
      .query({ q: "." });
    expect(
      dot.body.leaders.some((p: { id: string }) => p.id === a.user.id),
    ).toBe(true);
  });
});
