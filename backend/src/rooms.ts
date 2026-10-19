import { randomInt, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import type { Server, Socket } from "socket.io";
import {
  answerSchema,
  chatSchema,
  GAME_PROTOCOL_VERSION,
  roomSchema,
  eloDelta,
  gameIds,
  type ClientEvents,
  type ServerEvents,
  type Player,
  type RoomState,
  type RoomSettings,
  type RoundResult,
  type Answer,
  type ChatMessage,
} from "@duo-clash/shared";
import { AppError, authenticate, publicPlayer } from "./auth.js";
import {
  Match,
  MatchResult,
  User,
  Block,
  ChallengeCompletion,
} from "./models.js";
import {
  newRound,
  safeChallenge,
  scoreAnswer,
  answerText,
  type SecretRound,
  type ScoredAnswer,
} from "./games.js";
export type GameServer = Server<ClientEvents, ServerEvents>;
type GameSocket = Socket<ClientEvents, ServerEvents>;
export interface Member {
  player: Player;
  ready: boolean;
  sockets: Set<string>;
  score: number;
  disconnectedAt?: number;
  lastSeenAt?: number;
  lastChatAt?: number;
}
export interface LiveRoom {
  id: string;
  code: string;
  hostId: string;
  settings: RoomSettings;
  status: RoomState["status"];
  members: Map<string, Member>;
  round: number;
  secret: SecretRound | null;
  answers: Map<string, ScoredAnswer>;
  results: RoundResult[];
  nextAt?: number;
  expiresAt: number;
  persisted: boolean;
  saving: boolean;
  ratingChanges: Record<string, number>;
  signalSent: boolean;
  memoryHidden: boolean;
  completedPlayers?: RoomState["players"];
  usedQuizPrompts?: string[];
  chatMessages?: ChatMessage[];
  pausedRemaining?: number;
  pause?: RoomState["pause"];
  restartRequestedBy?: string;
  cancelReason?: string;
}
export function dailyInfo(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return {
    id: day,
    day,
    gameId: gameIds[Math.floor(Date.parse(day) / 86400000) % gameIds.length],
    reward: 200,
    description:
      "Complete a match and score at least 100 points in today’s game. Reward is granted automatically once per UTC day.",
  };
}
export class RoomManager {
  readonly rooms = new Map<string, LiveRoom>();
  readonly membership = new Map<string, string>();
  private busy = new Set<string>();
  private actions = new Map<string, Promise<unknown>>();
  private async exclusive<T>(
    key: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.actions.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    this.actions.set(key, current);
    try {
      return await current;
    } finally {
      if (this.actions.get(key) === current) this.actions.delete(key);
    }
  }
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private io: GameServer,
    private timing = { starting: 2500, results: 3500 },
    options: { manual?: boolean } = {},
  ) {
    if (options.manual) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 100);
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
  }
  state(room: LiveRoom): RoomState {
    const activePlayers = [...room.members.values()].map((m) => ({
      ...m.player,
      ready: m.ready,
      connected: m.sockets.size > 0,
      score: m.score,
    }));
    const players =
      room.status === "completed" && room.completedPlayers
        ? room.completedPlayers.map((p) => ({
            ...p,
            connected: (room.members.get(p.id)?.sockets.size ?? 0) > 0,
          }))
        : activePlayers;
    const top = Math.max(...players.map((p) => p.score));
    const pause =
      room.pause ??
      (room.status === "paused"
        ? {
            byId: room.hostId,
            phase:
              room.round === 0 ? ("starting" as const) : ("playing" as const),
            at: room.secret
              ? room.secret.challenge.deadline - (room.pausedRemaining ?? 0)
              : Date.now(),
          }
        : undefined);
    return {
      id: room.id,
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      status: room.status,
      players,
      round: room.round,
      challenge:
        room.secret &&
        (room.status === "playing" ||
          (room.status === "paused" && pause?.phase === "playing"))
          ? safeChallenge(room.secret, pause?.at ?? Date.now())
          : null,
      submitted: [...room.answers.keys()],
      results: room.results,
      serverNow: Date.now(),
      nextAt: room.nextAt,
      winnerIds:
        room.status === "completed"
          ? players.filter((p) => p.score === top).map((p) => p.id)
          : [],
      persisted: room.persisted,
      ratingChanges: room.ratingChanges,
      chatMessages: room.chatMessages ?? [],
      pause,
      restartRequestedBy: room.restartRequestedBy,
      cancelReason: room.cancelReason,
      protocolVersion: GAME_PROTOCOL_VERSION,
    };
  }
  broadcast(room: LiveRoom) {
    this.io.to(room.code).emit("room:state", this.state(room));
  }
  get(userId: string) {
    const r = this.rooms.get(this.membership.get(userId) ?? "");
    if (!r || !r.members.has(userId))
      throw new AppError("You are not in a room.", 404);
    return r;
  }
  async preview(userId: string, code: string) {
    const room = this.rooms.get(code);
    if (!room || room.expiresAt < Date.now())
      throw new AppError("Room not found or expired.", 404);
    const ids = [...room.members.keys()];
    if (
      await Block.exists({
        $or: [
          { userId, targetId: { $in: ids } },
          { userId: { $in: ids }, targetId: userId },
        ],
      })
    )
      throw new AppError("You cannot join this room.", 403);
    return {
      code,
      settings: room.settings,
      status: room.status,
      playerCount: room.members.size,
      canJoin:
        room.members.has(userId) ||
        (room.status === "waiting" &&
          room.members.size < room.settings.maxPlayers),
    };
  }
  async create(userId: string, settings: RoomSettings, socket?: GameSocket) {
    return this.exclusive(userId, () =>
      this.createRoom(userId, settings, socket),
    );
  }
  private async createRoom(
    userId: string,
    settings: RoomSettings,
    socket?: GameSocket,
  ) {
    if (this.membership.has(userId))
      throw new AppError("Leave your current room before creating another.");
    const user = await User.findById(userId);
    if (!user) throw new AppError("Account not found.", 401);
    let code = "";
    let id = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      code =
        "DUO-" +
        Array.from(
          { length: 6 },
          () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
        ).join("");
      id = randomUUID();
      try {
        await Match.create({
          _id: id,
          roomCode: code,
          hostId: userId,
          participantIds: [userId],
          settings,
          expiresAt: new Date(Date.now() + 2 * 3600000),
        });
        break;
      } catch (e) {
        if ((e as { code?: number }).code !== 11000 || attempt === 7) throw e;
      }
    }
    const room: LiveRoom = {
      id,
      code,
      hostId: userId,
      settings,
      status: "waiting",
      members: new Map([
        [
          userId,
          {
            player: publicPlayer(user),
            ready: true,
            sockets: new Set(socket ? [socket.id] : []),
            score: 0,
          },
        ],
      ]),
      round: 0,
      secret: null,
      answers: new Map(),
      results: [],
      expiresAt: Date.now() + 2 * 3600000,
      persisted: false,
      saving: false,
      ratingChanges: {},
      signalSent: false,
      memoryHidden: false,
    };
    this.rooms.set(code, room);
    this.membership.set(userId, code);
    if (socket) await socket.join(code);
    this.broadcast(room);
    return this.state(room);
  }
  async join(userId: string, code: string, socket?: GameSocket) {
    return this.exclusive(userId, () => this.joinRoom(userId, code, socket));
  }
  private async joinRoom(userId: string, code: string, socket?: GameSocket) {
    const room = this.rooms.get(code);
    if (!room || room.expiresAt < Date.now())
      throw new AppError("Room not found or expired.", 404);
    const current = this.membership.get(userId);
    if (current && current !== code)
      throw new AppError("Leave your current room first.");
    let member = room.members.get(userId);
    if (!member) {
      if (room.status !== "waiting")
        throw new AppError("This match has already started.");
      if (room.members.size >= room.settings.maxPlayers)
        throw new AppError("This room is full.");
      const ids = [...room.members.keys()];
      if (
        await Block.exists({
          $or: [
            { userId, targetId: { $in: ids } },
            { userId: { $in: ids }, targetId: userId },
          ],
        })
      )
        throw new AppError("You cannot join this room.", 403);
      const user = await User.findOne({ _id: userId, status: "active" });
      if (!user) throw new AppError("Account unavailable.", 401);
      if (
        room.status !== "waiting" ||
        room.members.size >= room.settings.maxPlayers
      )
        throw new AppError("This room is no longer accepting players.");
      if (this.membership.has(userId) && this.membership.get(userId) !== code)
        throw new AppError("Leave your current room first.");
      member = {
        player: publicPlayer(user),
        ready: false,
        sockets: new Set(),
        score: 0,
      };
      room.members.set(userId, member);
      this.membership.set(userId, code);
      await Match.updateOne(
        { _id: room.id },
        { $addToSet: { participantIds: userId } },
      );
    }
    if (socket) {
      member.sockets.add(socket.id);
      delete member.disconnectedAt;
      await socket.join(code);
    }
    this.broadcast(room);
    return this.state(room);
  }
  async leave(userId: string) {
    const room = this.get(userId);
    const active = !["waiting", "completed", "cancelled"].includes(room.status);
    if (active && !room.persisted) {
      await this.cancelRoom(
        room,
        room.members.get(userId)!.player.displayName + " left the match.",
      );
    } else if (room.persisted) room.status = "completed";
    const m = room.members.get(userId)!;
    for (const id of m.sockets)
      await this.io.sockets.sockets.get(id)?.leave(room.code);
    room.members.delete(userId);
    this.membership.delete(userId);
    if (!room.members.size) {
      this.rooms.delete(room.code);
      await Match.updateOne(
        { _id: room.id, status: { $ne: "completed" } },
        { status: "cancelled" },
      );
    } else {
      if (room.hostId === userId) {
        room.hostId = room.members.keys().next().value!;
        room.members.get(room.hostId)!.ready = true;
      }
      this.broadcast(room);
    }
  }
  pause(userId: string) {
    const r = this.get(userId);
    if (r.status === "paused") return;
    if (
      !["playing", "starting", "round-results"].includes(r.status) ||
      r.persisted ||
      r.saving
    )
      throw new AppError("This match cannot be paused now.");
    if (
      r.status === "playing" &&
      r.secret &&
      Date.now() >= r.secret.challenge.deadline
    )
      throw new AppError(
        "This round has just ended. Try again in the next round.",
      );
    r.pause = {
      byId: userId,
      at: Date.now(),
      phase: r.status as "playing" | "starting" | "round-results",
    };
    r.status = "paused";
    this.broadcast(r);
  }
  resume(userId: string) {
    const r = this.get(userId);
    if (r.status !== "paused") throw new AppError("Match is not paused.");
    const paused = this.state(r).pause!;
    const elapsed = Math.max(0, Date.now() - paused.at);
    if (r.secret) {
      const c = r.secret.challenge;
      c.startedAt += elapsed;
      c.deadline += elapsed;
      if (c.showUntil !== undefined) c.showUntil += elapsed;
      if (c.signalAt !== undefined) c.signalAt += elapsed;
      if (r.secret.signalAt !== undefined) r.secret.signalAt += elapsed;
    }
    if (r.nextAt !== undefined) r.nextAt += elapsed;
    r.status = paused.phase;
    r.pause = undefined;
    r.pausedRemaining = undefined;
    this.broadcast(r);
  }
  private async cancelRoom(r: LiveRoom, reason: string) {
    if (r.persisted || r.saving)
      throw new AppError("This match has finished. Its saved scores are kept.");
    const previous = r.status;
    r.status = "cancelled";
    try {
      await Match.updateOne(
        { _id: r.id, status: { $ne: "completed" } },
        { $set: { status: "cancelled" } },
      );
    } catch (error) {
      r.status = previous;
      throw error;
    }
    r.pause = undefined;
    r.nextAt = undefined;
    r.restartRequestedBy = undefined;
    r.cancelReason = reason;
    this.broadcast(r);
  }
  async cancel(userId: string) {
    const r = this.get(userId);
    if (r.hostId !== userId)
      throw new AppError("Only the host can cancel the match.", 403);
    if (r.status === "cancelled") return;
    await this.cancelRoom(r, "The host cancelled this match.");
  }
  requestRestart(userId: string) {
    const r = this.get(userId);
    if (!["starting", "playing", "paused", "round-results"].includes(r.status))
      throw new AppError("There is no active match to restart.");
    r.restartRequestedBy = userId;
    this.broadcast(r);
  }
  async restart(userId: string) {
    return this.exclusive(userId, async () => {
      const r = this.get(userId);
      if (r.hostId !== userId)
        throw new AppError(
          "Only the host can restart the match. Send a restart request instead.",
          403,
        );
      if (r.saving || this.busy.has(r.code))
        throw new AppError("The round is changing. Please try again.", 409);
      await this.rematchRoom(userId, true);
      if (
        [...r.members.values()].every((m) => m.sockets.size > 0) &&
        (!r.settings.ranked || r.members.size === 2)
      ) {
        for (const m of r.members.values()) m.ready = true;
        await this.startMatch(userId);
      }
    });
  }
  ready(userId: string, ready: boolean) {
    const r = this.get(userId);
    if (r.status !== "waiting") throw new AppError("The lobby is closed.");
    r.members.get(userId)!.ready = ready;
    this.broadcast(r);
  }
  async start(userId: string) {
    return this.exclusive(userId, () => this.startMatch(userId));
  }
  private async startMatch(userId: string) {
    const r = this.get(userId);
    if (r.hostId !== userId)
      throw new AppError("Only the host can start the match.", 403);
    if (r.status !== "waiting")
      throw new AppError("This match has already started.");
    if (r.settings.ranked && r.members.size !== 2)
      throw new AppError("Ranked matches need two players.");
    const hostMember = r.members.get(userId);
    if (hostMember) hostMember.ready = true;
    if ([...r.members.values()].some((m) => !m.ready || !m.sockets.size))
      throw new AppError("Every player must be connected and ready.");
    // Prepare the first question before entering the countdown, to catch empty content categories.
    const first = await newRound(
      r.settings.gameIds[0],
      1,
      r.settings.duration,
      r.settings.category,
    );
    r.secret = first;
    if (
      r.status !== "waiting" ||
      r.hostId !== userId ||
      [...r.members.values()].some((m) => !m.ready || !m.sockets.size)
    )
      throw new AppError("The lobby changed. Check readiness and try again.");
    r.status = "starting";
    r.nextAt = Date.now() + this.timing.starting;
    await Match.updateOne(
      { _id: r.id },
      { status: "starting", participantIds: [...r.members.keys()] },
    );
    this.broadcast(r);
  }
  async submit(userId: string, a: Answer) {
    const r = this.get(userId);
    if (
      r.code !== a.code ||
      r.status !== "playing" ||
      !r.secret ||
      r.secret.challenge.id !== a.roundId
    )
      throw new AppError("This round is no longer accepting answers.");
    if (r.answers.has(userId))
      throw new AppError("Your answer was already submitted.");
    const score = scoreAnswer(r.secret, a.value);
    r.answers.set(userId, score);
    r.members.get(userId)!.score += score.points;
    this.broadcast(r);
    if (r.answers.size === r.members.size) await this.endRound(r);
  }
  private async beginRound(r: LiveRoom, startedAt = Date.now()) {
    const expected = { id: r.id, status: r.status, round: r.round };
    const nextRound = r.round + 1;
    const game =
      r.settings.gameIds[(nextRound - 1) % r.settings.gameIds.length];
    const secret = await newRound(
      game,
      nextRound,
      r.settings.duration,
      r.settings.category,
      startedAt,
      r.usedQuizPrompts ?? [],
    );
    if (
      r.id !== expected.id ||
      r.status !== expected.status ||
      r.round !== expected.round
    )
      return;
    r.round = nextRound;
    r.secret = secret;
    if (game === "quick-quiz") {
      r.usedQuizPrompts ??= [];
      r.usedQuizPrompts.push(secret.challenge.prompt);
    }
    r.answers.clear();
    r.status = "playing";
    r.nextAt = undefined;
    r.signalSent = false;
    r.memoryHidden = false;
    this.broadcast(r);
  }
  private async endRound(r: LiveRoom, endedAt = Date.now()) {
    if (r.status !== "playing" || !r.secret) return;
    r.status = "round-results";
    r.results.push({
      round: r.round,
      gameId: r.secret.challenge.gameId,
      answer: `${answerText(r.secret)}${r.secret.explanation ? " · " + r.secret.explanation : ""}`,
      scores: [...r.members].map(([userId]) => ({
        userId,
        ...(r.answers.get(userId) ?? {
          points: 0,
          correct: false,
          detail: "No answer",
        }),
      })),
    });
    r.nextAt = endedAt + this.timing.results;
    if (r.round >= r.settings.rounds) await this.persist(r);
    this.broadcast(r);
  }
  async persist(r: LiveRoom) {
    if (r.persisted || r.saving) return;
    r.saving = true;
    try {
      await mongoose.connection.transaction(async (session) => {
        const claimed = await Match.findOneAndUpdate(
          { _id: r.id, status: { $ne: "completed" } },
          {
            $set: {
              status: "completed",
              rounds: r.results,
              completedAt: new Date(),
            },
          },
          { session, new: true },
        );
        if (!claimed) return;
        const members = [...r.members];
        const high = Math.max(...members.map(([, m]) => m.score));
        const tie = members.filter(([, m]) => m.score === high).length > 1;
        const users = await User.find({
          _id: { $in: members.map(([id]) => id) },
        }).session(session);
        const initialRatings = new Map(users.map((u) => [u.id, u.rating]));
        const daily = dailyInfo();
        const ratingChanges: Record<string, number> = {};
        for (const [userId, member] of members) {
          const user = users.find((u) => u.id === userId);
          if (!user) continue;
          const won = members.length > 1 && member.score === high && !tie;
          let delta = 0;
          if (r.settings.ranked && members.length === 2) {
            const other = users.find((u) => u.id !== userId)!;
            delta = eloDelta(
              initialRatings.get(userId)!,
              initialRatings.get(other.id)!,
              tie ? 0.5 : won ? 1 : 0,
            );
          }
          ratingChanges[userId] = delta;
          let points = member.score;
          const correctQuiz = r.results.filter(
            (x) =>
              x.gameId === "quick-quiz" &&
              x.scores.some((s) => s.userId === userId && s.correct),
          ).length;
          const dailyScore = r.results
            .filter((x) => x.gameId === daily.gameId)
            .reduce(
              (n, x) =>
                n + (x.scores.find((s) => s.userId === userId)?.points ?? 0),
              0,
            );
          if (
            dailyScore >= 100 &&
            !(await ChallengeCompletion.exists({
              userId,
              day: daily.day,
            }).session(session))
          ) {
            await ChallengeCompletion.create(
              [{ userId, day: daily.day, matchId: r.id, reward: daily.reward }],
              { session },
            );
            points += daily.reward;
            if (!user.achievements.includes("daily"))
              user.achievements.push("daily");
          }
          const before = user.rating;
          user.rating += delta;
          user.points += points;
          user.matches++;
          if (won) user.wins++;
          user.streak = won ? user.streak + 1 : 0;
          user.quizCorrect += correctQuiz;
          const earned = [
            "first-match",
            ...(won ? ["first-victory"] : []),
            ...(user.matches >= 5 ? ["five-matches"] : []),
            ...(user.streak >= 3 ? ["three-wins"] : []),
            ...(user.quizCorrect >= 10 ? ["quiz-master"] : []),
          ];
          for (const id of earned)
            if (!user.achievements.includes(id)) user.achievements.push(id);
          await user.save({ session });
          await MatchResult.create(
            [
              {
                matchId: r.id,
                userId,
                score: member.score,
                points,
                placement:
                  1 + members.filter(([, m]) => m.score > member.score).length,
                won,
                roundScores: r.results.map(
                  (x) => x.scores.find((s) => s.userId === userId)?.points ?? 0,
                ),
                ratingBefore: before,
                ratingAfter: user.rating,
                completedAt: new Date(),
              },
            ],
            { session },
          );
        }
        await Match.updateOne({ _id: r.id }, { ratingChanges }, { session });
      });
      const saved = await Match.findById(r.id);
      r.ratingChanges = saved?.ratingChanges ?? {};
      r.persisted = true;
      const fresh = await User.find({ _id: { $in: [...r.members.keys()] } });
      for (const u of fresh) r.members.get(u.id)!.player = publicPlayer(u);
      r.completedPlayers = this.state(r).players;
    } finally {
      r.saving = false;
    }
  }
  async rematch(userId: string) {
    return this.exclusive(userId, () => this.rematchRoom(userId));
  }
  private async rematchRoom(userId: string, restart = false) {
    const r = this.get(userId);
    if (r.hostId !== userId)
      throw new AppError("Only the host can set up a rematch.", 403);
    if (!restart && (r.status !== "completed" || !r.persisted))
      throw new AppError("Wait for the results to save.");
    if (r.saving) throw new AppError("Wait for the results to save.");
    const nextId = randomUUID();
    await mongoose.connection.transaction(async (session) => {
      await Match.updateOne(
        { _id: r.id },
        {
          $unset: { roomCode: 1 },
          ...(!r.persisted ? { $set: { status: "cancelled" } } : {}),
        },
        { session },
      );
      await Match.create(
        [
          {
            _id: nextId,
            roomCode: r.code,
            hostId: r.hostId,
            settings: r.settings,
            participantIds: [...r.members.keys()],
          },
        ],
        { session },
      );
    });
    r.id = nextId;
    r.completedPlayers = undefined;
    r.pause = undefined;
    r.pausedRemaining = undefined;
    r.restartRequestedBy = undefined;
    r.cancelReason = undefined;
    r.usedQuizPrompts = [];
    r.round = 0;
    r.status = "waiting";
    r.results = [];
    r.answers.clear();
    r.secret = null;
    r.nextAt = undefined;
    r.persisted = false;
    r.ratingChanges = {};
    r.expiresAt = Date.now() + 2 * 3600000;
    for (const m of r.members.values()) {
      m.score = 0;
      m.ready = m.player.id === r.hostId;
    }
    this.broadcast(r);
  }
  chat(userId: string, text: string, id?: string) {
    const r = this.get(userId),
      m = r.members.get(userId)!;
    const message = chatSchema.parse({ code: r.code, text, id });
    if (r.status === "cancelled") throw new AppError("This match has ended.");
    const existing =
      message.id && r.chatMessages?.find((msg) => msg.id === message.id);
    if (existing) {
      if (existing.userId !== userId || existing.text !== message.text)
        throw new AppError("Message identifier is already in use.", 409);
      return existing;
    }
    if (Date.now() - (m.lastChatAt ?? 0) < 500)
      throw new AppError(
        "Please wait a moment before sending another message.",
        429,
      );
    const msg: ChatMessage = {
      id: message.id ?? randomUUID(),
      userId,
      displayName: m.player.displayName,
      avatar: m.player.avatar,
      text: message.text,
      at: Date.now(),
    };
    m.lastChatAt = msg.at;
    r.chatMessages = [...(r.chatMessages ?? []).slice(-49), msg];
    this.io.to(r.code).emit("chat:message", msg);
    this.broadcast(r);
    return msg;
  }
  disconnect(userId: string, socketId: string) {
    const r = this.rooms.get(this.membership.get(userId) ?? "");
    const m = r?.members.get(userId);
    if (!m || !r) return;
    m.sockets.delete(socketId);
    if (!m.sockets.size) m.disconnectedAt = Date.now();
    this.broadcast(r);
  }
  async tick() {
    for (const r of this.rooms.values()) {
      if (this.busy.has(r.code)) continue;
      this.busy.add(r.code);
      try {
        const now = Date.now();
        if (now > r.expiresAt) {
          r.status = "cancelled";
          this.broadcast(r);
          await Match.updateOne(
            { _id: r.id, status: { $ne: "completed" } },
            { status: "cancelled" },
          );
          for (const [id] of r.members) this.membership.delete(id);
          this.rooms.delete(r.code);
          this.io.to(r.code).emit("room:error", "This room has expired.");
          continue;
        }
        if (r.status === "waiting") {
          for (const [id, m] of r.members)
            if (
              !m.sockets.size &&
              m.disconnectedAt &&
              now - m.disconnectedAt > 30000
            )
              await this.leave(id);
        }
        if (r.status === "paused") continue;
        // Advance from scheduled times so a cold instance catches up missed
        // deadlines instead of extending a round or restarting its answer window.
        for (let step = 0; step < r.settings.rounds * 2 + 4; step++) {
          const before = `${r.status}:${r.round}:${r.nextAt}`;
          if (r.status === "starting" && now >= r.nextAt!)
            await this.beginRound(r, r.nextAt);
          if (r.status === "playing" && r.secret) {
            if (
              !r.signalSent &&
              r.secret.signalAt &&
              now >= r.secret.signalAt
            ) {
              r.signalSent = true;
              this.broadcast(r);
            }
            if (
              !r.memoryHidden &&
              r.secret.challenge.showUntil &&
              now >= r.secret.challenge.showUntil
            ) {
              r.memoryHidden = true;
              this.broadcast(r);
            }
            if (now >= r.secret.challenge.deadline)
              await this.endRound(r, r.secret.challenge.deadline);
          }
          if (r.status === "round-results" && now >= r.nextAt!) {
            if (r.round < r.settings.rounds) await this.beginRound(r, r.nextAt);
            else {
              await this.persist(r);
              r.status = "completed";
              r.nextAt = undefined;
              this.broadcast(r);
            }
          }
          if (before === `${r.status}:${r.round}:${r.nextAt}`) break;
        }
      } catch (e) {
        console.error(
          "Room update failed:",
          e instanceof Error ? e.message : "unknown",
        );
        this.io
          .to(r.code)
          .emit(
            "room:error",
            "The server could not update this match. It will retry.",
          );
        r.nextAt = Date.now() + 5000;
      } finally {
        this.busy.delete(r.code);
      }
    }
  }
  attach() {
    this.io.use(async (socket, next) => {
      try {
        const auth = await authenticate(socket.request.headers.cookie);
        if (!auth) return next(new Error("Please log in."));
        socket.data.userId = auth.user.id;
        next();
      } catch {
        next(new Error("Authentication unavailable."));
      }
    });
    this.io.on("connection", (socket) => {
      const userId = socket.data.userId as string;
      void socket.join(`user:${userId}`);
      let count = 0;
      let windowAt = Date.now();
      let chain = Promise.resolve();
      const on = (
        name: keyof ClientEvents,
        schema: z.ZodTypeAny,
        handler: (data: any) => unknown,
      ) => {
        socket.on(name as any, (payload: unknown, ack: unknown) => {
          chain = chain.then(async () => {
            try {
              if (Date.now() - windowAt > 10000) {
                count = 0;
                windowAt = Date.now();
              }
              if (++count > 60)
                throw new AppError("Too many actions. Please slow down.");
              const auth = await authenticate(socket.request.headers.cookie);
              if (!auth || auth.user.id !== userId) {
                socket.disconnect();
                throw new AppError("Session expired. Please log in.");
              }
              const data = schema.parse(payload);
              const result = await handler(data);
              if (typeof ack === "function") ack({ ok: true, data: result });
            } catch (e) {
              const error =
                e instanceof z.ZodError
                  ? e.issues[0].message
                  : e instanceof AppError
                    ? e.message
                    : "The action could not be completed.";
              if (typeof ack === "function") ack({ ok: false, error });
              else socket.emit("room:error", error);
            }
          });
        });
      };
      const empty = z.object({}).strict();
      on("room:create", roomSchema, (d) => this.create(userId, d, socket));
      on(
        "room:join",
        z.object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^DUO-[A-Z2-9]{6}$/),
        }),
        (d) => this.join(userId, d.code, socket),
      );
      on("room:sync", z.object({ code: z.string().optional() }), async (d) => {
        const code = this.membership.get(userId);
        if (!code || (d.code && d.code !== code)) return null;
        return this.join(userId, code, socket);
      });
      on("room:leave", empty, () => this.leave(userId));
      on("room:ready", z.object({ ready: z.boolean() }), (d) =>
        this.ready(userId, d.ready),
      );
      on("room:pause", empty, () => this.pause(userId));
      on("room:resume", empty, () => this.resume(userId));
      on("match:start", empty, () => this.start(userId));
      on("match:rematch", empty, () => this.rematch(userId));
      on("match:restart", empty, () => this.restart(userId));
      on("match:restart-request", empty, () => this.requestRestart(userId));
      on("match:cancel", empty, () => this.cancel(userId));
      on("answer:submit", answerSchema, (d) => this.submit(userId, d));
      on("chat:send", chatSchema, (d) => {
        if (this.get(userId).code !== d.code)
          throw new AppError("You are not in this room.", 403);
        return this.chat(userId, d.text, d.id);
      });
      socket.on("disconnect", () => this.disconnect(userId, socket.id));
    });
  }
}
