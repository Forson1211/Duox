import { createContext, useContext } from "react";
import type { GameConnection } from "./connection";
import type {
  Account,
  RoomState,
  ClientEvents,
  ServerEvents,
} from "@duo-clash/shared";
export type GameSocket = GameConnection;
export type NotificationType = "match" | "achievement" | "friend" | "system";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  link?: string;
  actionText?: string;
}

export interface NotifyOptions {
  type?: NotificationType;
  title?: string;
  link?: string;
  actionText?: string;
}

export interface AppContextValue {
  user: Account;
  refresh: () => Promise<unknown>;
  socket: GameSocket | null;
  connected: boolean;
  room: RoomState | null;
  setRoom: (room: RoomState | null) => void;
  notify: (message: string, options?: NotifyOptions) => void;
  dark: boolean;
  setDark: (value: boolean) => void;
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (id?: string) => void;
  clearNotifications: () => void;
  dismissNotification: (id: string) => void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("App context unavailable.");
  return value;
}
export function command<T>(
  socket: GameSocket | null,
  event: keyof ClientEvents,
  payload: unknown,
): Promise<T> {
  if (!socket?.connected)
    return Promise.reject(
      new Error("Connection lost. Wait for the server to reconnect."),
    );
  return socket.request<T>(event, payload);
}
