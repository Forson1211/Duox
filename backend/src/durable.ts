import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  answerSchema,
  roomSchema,
  type ClientEvents,
  type RoomState,
} from "@duo-clash/shared";
import { AppError } from "./auth.js";
import { GameLease, LiveGameRoom, PlayerPresence } from "./models.js";
import {
  RoomManager,
  type GameServer,
  type LiveRoom,
  type Member,
} from "./rooms.js";
import type { ScoredAnswer } from "./games.js";

type Snapshot = Omit<LiveRoom, "members" | "answers"> & {
  members: [string, Omit<Member, "sockets"> & { sockets: string[] }][];
  answers: [string, ScoredAnswer][];
};
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^DUO-[A-Z2-9]{6}$/);
const empty = z.object({}).strict();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// All instances share private snapshots. Leases serialize room changes and revision
// checks prevent an expired worker from overwriting a newer room snapshot.
export class DurableRooms {
  private presenceAt = new Map<string, number>();
  constructor(
    private io: GameServer,
    private timing?: { starting: number; results: number },
  ) {}
  private manager(snapshot?: Snapshot) {
    const manager = new RoomManager(this.io, this.timing, { manual: true });
    if (snapshot) {
      const members = new Map(
        snapshot.members.map(([id, m]) => {
          const online = Date.now() - (m.lastSeenAt ?? 0) < 15000;
          return [
            id,
            {
              ...m,
              sockets: new Set(online ? ["http:" + id] : []),
              disconnectedAt: online ? undefined : m.lastSeenAt,
            },
          ] as [string, Member];
        }),
      );
      const room: LiveRoom = {
        ...snapshot,
        members,
        answers: new Map(snapshot.answers),
        saving: false,
      };
      manager.rooms.set(room.code, room);
      for (const id of members.keys()) manager.membership.set(id, room.code);
    }
    return manager;
  }
  private snapshot(room: LiveRoom): Snapshot {
    return {
      ...room,
      saving: false,
      members: [...room.members].map(([id, m]) => [
        id,
        { ...m, sockets: [...m.sockets] },
      ]),
      answers: [...room.answers],
    };
  }
  private touch(room: LiveRoom, userId: string) {
    const member = room.members.get(userId);
    if (member) {
      member.lastSeenAt = Date.now();
      member.sockets = new Set(["http:" + userId]);
      delete member.disconnectedAt;
    }
  }
  private async lease<T>(
    key: string,
    action: (owner: string) => Promise<T>,
  ): Promise<T> {
    const owner = randomUUID();
    const limit = Date.now() + 6000;
    let acquired = false;
    while (Date.now() < limit) {
      try {
        const lock = await GameLease.findOneAndUpdate(
          { _id: key, $or: [{ until: { $lte: new Date() } }, { owner }] },
          { $set: { owner, until: new Date(Date.now() + 15000) } },
          { upsert: true, new: true },
        );
        acquired = lock?.owner === owner;
        if (acquired) break;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
      await pause(35 + Math.random() * 45);
    }
    if (!acquired)
      throw new AppError("This room is busy. Please try again.", 409);
    const renewal = setInterval(() => {
      void GameLease.updateOne(
        { _id: key, owner },
        { $set: { until: new Date(Date.now() + 15000) } },
      ).catch(() => undefined);
    }, 4000);
    renewal.unref();
    try {
      return await action(owner);
    } finally {
      clearInterval(renewal);
      await GameLease.deleteOne({ _id: key, owner });
    }
  }
  private async presence(userId: string) {
    const now = Date.now();
    if (now - (this.presenceAt.get(userId) ?? 0) < 10000) return;
    await PlayerPresence.updateOne(
      { _id: userId },
      { $set: { expiresAt: new Date(now + 35000) } },
      { upsert: true },
    );
    this.presenceAt.set(userId, now);
    if (this.presenceAt.size > 10000) this.presenceAt.clear();
  }
  async hasRoom(userId: string) {
    return !!(await LiveGameRoom.exists({
      memberIds: userId,
      expiresAt: { $gt: new Date() },
    }));
  }
  private due(snapshot: Snapshot) {
    const now = Date.now();
    return (
      snapshot.expiresAt <= now ||
      ((snapshot.status === "starting" ||
        snapshot.status === "round-results") &&
        (snapshot.nextAt ?? Infinity) <= now) ||
      (snapshot.status === "playing" &&
        (snapshot.secret?.challenge.deadline ?? Infinity) <= now) ||
      (snapshot.status === "waiting" &&
        snapshot.members.some(([, m]) => now - (m.lastSeenAt ?? 0) > 30000))
    );
  }
  private async change(
    code: string,
    userId: string,
    action: (manager: RoomManager) => Promise<unknown> | unknown,
  ) {
    return this.lease("room:" + code, async (owner) => {
      const doc = await LiveGameRoom.findById(code).lean();
      if (!doc) throw new AppError("Room not found or expired.", 404);
      const manager = this.manager(doc.snapshot as Snapshot);
      let result: unknown;
      try {
        const existing = manager.rooms.get(code)!;
        this.touch(existing, userId);
        await manager.tick();
        result = await action(manager);
        const live = manager.rooms.get(code);
        if (live) this.touch(live, userId);
        return {
          data: result,
          room: live && live.members.has(userId) ? manager.state(live) : null,
        };
      } finally {
        try {
          if (
            !(await GameLease.exists({
              _id: "room:" + code,
              owner,
              until: { $gt: new Date() },
            }))
          )
            throw new AppError("The room changed. Please try again.", 409);
          const room = manager.rooms.get(code);
          if (room) {
            const saved = await LiveGameRoom.updateOne(
              { _id: code, revision: doc.revision },
              {
                $set: {
                  snapshot: this.snapshot(room),
                  memberIds: [...room.members.keys()],
                  expiresAt: new Date(room.expiresAt),
                },
                $inc: { revision: 1 },
              },
            );
            if (!saved.modifiedCount)
              throw new AppError("The room changed. Please try again.", 409);
          } else
            await LiveGameRoom.deleteOne({ _id: code, revision: doc.revision });
        } finally {
          manager.close();
        }
      }
    });
  }
  async sync(
    userId: string,
    requestedCode?: string,
  ): Promise<RoomState | null> {
    await this.presence(userId);
    const doc = await LiveGameRoom.findOne({ memberIds: userId }).lean();
    if (!doc || (requestedCode && doc._id !== requestedCode)) return null;
    const snapshot = doc.snapshot as Snapshot;
    const member = snapshot.members.find(([id]) => id === userId)?.[1];
    if (this.due(snapshot) || Date.now() - (member?.lastSeenAt ?? 0) > 3000) {
      const changed = await this.change(doc._id!, userId, () => undefined);
      return changed.room;
    }
    const manager = this.manager(snapshot);
    try {
      return manager.state(manager.get(userId));
    } finally {
      manager.close();
    }
  }
  async execute(
    userId: string,
    event: keyof ClientEvents,
    payload: unknown,
  ): Promise<{ data: unknown; room: RoomState | null }> {
    await this.presence(userId);
    if (event === "room:sync") {
      const data = z.object({ code: codeSchema.optional() }).parse(payload);
      const room = await this.sync(userId, data.code);
      return { data: room, room };
    }
    if (event === "room:create") {
      const settings = roomSchema.parse(payload);
      return this.lease("user:" + userId, async () => {
        const current = await this.sync(userId);
        if (current)
          throw new AppError(
            "Leave your current room before creating another.",
          );
        const manager = this.manager();
        try {
          const state = await manager.create(userId, settings);
          const room = manager.rooms.get(state.code)!;
          this.touch(room, userId);
          await LiveGameRoom.create({
            _id: room.code,
            snapshot: this.snapshot(room),
            memberIds: [userId],
            expiresAt: new Date(room.expiresAt),
          });
          const result = manager.state(room);
          return { data: result, room: result };
        } finally {
          manager.close();
        }
      });
    }
    if (event === "room:join") {
      const { code } = z.object({ code: codeSchema }).parse(payload);
      return this.lease("user:" + userId, () =>
        this.change(code, userId, async (manager) => {
          const current = await LiveGameRoom.exists({
            memberIds: userId,
            _id: { $ne: code },
            expiresAt: { $gt: new Date() },
          });
          if (current) throw new AppError("Leave your current room first.");
          return manager.join(userId, code);
        }),
      );
    }
    const doc = await LiveGameRoom.findOne({ memberIds: userId })
      .select("_id")
      .lean();
    if (!doc) throw new AppError("You are not in a room.", 404);
    const action = (manager: RoomManager) => {
      switch (event) {
        case "room:leave":
          empty.parse(payload);
          return manager.leave(userId);
        case "room:ready":
          return manager.ready(
            userId,
            z.object({ ready: z.boolean() }).parse(payload).ready,
          );
        case "match:start":
          empty.parse(payload);
          return manager.start(userId);
        case "match:rematch":
          empty.parse(payload);
          return manager.rematch(userId);
        case "answer:submit":
          return manager.submit(userId, answerSchema.parse(payload));
        default:
          throw new AppError("Unknown game action.", 400);
      }
    };
    return event === "room:leave"
      ? this.lease("user:" + userId, () =>
          this.change(doc._id!, userId, action),
        )
      : this.change(doc._id!, userId, action);
  }
}
