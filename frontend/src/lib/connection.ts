import { io, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents, RoomState } from "@duo-clash/shared";
import { api, post, ApiError } from "./api";

type Events = {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: () => void;
  "room:state": (room: RoomState | null) => void;
  "room:error": (message: string) => void;
};
type Listener = (...args: any[]) => void;
export class GameConnection {
  connected = false;
  private stopped = false;
  private http = false;
  private native?: Socket<ServerEvents, ClientEvents>;
  private listeners = new Map<keyof Events, Set<Listener>>();
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private mutations = 0;
  private reading = false;
  private room: RoomState | null = null;
  on<E extends keyof Events>(event: E, listener: Events[E]) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Listener);
    return this;
  }
  private emit(event: keyof Events, ...args: unknown[]) {
    for (const fn of this.listeners.get(event) ?? []) fn(...args);
  }
  constructor() {
    void this.start();
  }
  private async start() {
    try {
      const health = await api<{ transport?: string }>("/health");
      if (this.stopped) return;
      this.http = health.transport === "http";
      if (this.http) {
        await this.poll();
        return;
      }
      const socket = io(import.meta.env.VITE_SOCKET_URL?.trim() || undefined, {
        withCredentials: true,
        autoConnect: false,
      });
      this.native = socket;
      socket.on("connect", () => {
        this.connected = true;
        this.emit("connect");
      });
      socket.on("disconnect", (reason) => {
        this.connected = false;
        this.emit("disconnect", reason);
      });
      socket.on("connect_error", () => this.emit("connect_error"));
      socket.on("room:state", (room) => this.emit("room:state", room));
      socket.on("room:error", (message) => this.emit("room:error", message));
      socket.connect();
    } catch {
      if (this.stopped) return;
      this.emit("connect_error");
      this.timer = setTimeout(() => void this.start(), 2000);
    }
  }
  private apply(room: RoomState | null) {
    const previous = this.room;
    this.room = room;
    if (room || previous) this.emit("room:state", room);
  }
  private delay() {
    if (!this.room) return 10000;
    if (
      this.room.status === "playing" &&
      this.room.challenge?.gameId === "reflex-race"
    )
      return 160;
    if (["starting", "round-results"].includes(this.room.status)) return 300;
    if (this.room.status === "playing") return 400;
    return 1000;
  }
  private schedule(delay = this.delay()) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => void this.poll(), delay);
  }
  private async poll() {
    if (this.stopped || this.reading) return;
    if (this.mutations) {
      this.schedule(150);
      return;
    }
    this.reading = true;
    const epoch = this.epoch;
    let delay: number | undefined;
    try {
      const result = await api<{ room: RoomState | null }>("/realtime/state");
      if (this.stopped) return;
      if (!this.connected) {
        this.connected = true;
        this.emit("connect");
      }
      if (epoch === this.epoch) this.apply(result.room);
    } catch (error) {
      if (this.stopped) return;
      if (this.connected) {
        this.connected = false;
        this.emit(
          "disconnect",
          error instanceof ApiError && error.status === 401
            ? "unauthorized"
            : "network",
        );
      }
      this.emit("connect_error");
      delay = 2000;
    } finally {
      this.reading = false;
      if (!this.stopped) this.schedule(delay);
    }
  }
  async request<T>(event: keyof ClientEvents, payload: unknown): Promise<T> {
    if (!this.connected)
      throw new Error("Connection lost. Wait for the server to reconnect.");
    if (!this.http)
      return new Promise<T>((resolve, reject) => {
        (this.native!.timeout(10000).emit as Function)(
          event,
          payload,
          (
            error: Error | null,
            reply: { ok: boolean; data: T; error?: string },
          ) => {
            if (error)
              reject(
                new Error("The server did not respond. Please try again."),
              );
            else if (!reply.ok) reject(new Error(reply.error));
            else resolve(reply.data);
          },
        );
      });
    this.epoch++;
    this.mutations++;
    try {
      const result = await post<{ data: T; room: RoomState | null }>(
        "/realtime/command",
        { event, payload },
      );
      if (!this.stopped) this.apply(result.room);
      return result.data;
    } finally {
      this.mutations--;
      this.epoch++;
      this.schedule(80);
    }
  }
  disconnect() {
    this.stopped = true;
    this.connected = false;
    clearTimeout(this.timer);
    this.native?.disconnect();
    this.listeners.clear();
  }
}
export const createGameConnection = () => new GameConnection();
