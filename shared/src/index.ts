import { z } from "zod";
export const gameIds = [
  "quick-quiz",
  "memory-rush",
  "word-blitz",
  "reflex-race",
  "number-circuit",
  "code-breaker",
] as const;
export type GameId = (typeof gameIds)[number];
export const games = [
  {
    id: "quick-quiz",
    title: "Quick Quiz",
    category: "TRIVIA",
    description: "One question. Four choices. Race for the right answer.",
    tone: "violet",
  },
  {
    id: "memory-rush",
    title: "Memory Rush",
    category: "MEMORY",
    description: "Watch the tiles, remember the sequence, repeat it.",
    tone: "pink",
  },
  {
    id: "word-blitz",
    title: "Word Blitz",
    category: "WORD PLAY",
    description: "Unscramble the letters before the clock runs out.",
    tone: "orange",
  },
  {
    id: "reflex-race",
    title: "Reflex Race",
    category: "REACTION",
    description: "Wait for GO. Then make your move.",
    tone: "blue",
  },
  {
    id: "number-circuit",
    title: "Number Circuit",
    category: "MENTAL MATH",
    description: "Connect the numbers. Beat the clock. Keep your mind sharp.",
    tone: "blue",
  },
  {
    id: "code-breaker",
    title: "Code Breaker",
    category: "LOGIC",
    description: "A secret code. A handful of clues. One clever deduction.",
    tone: "orange",
  },
] satisfies {
  id: GameId;
  title: string;
  category: string;
  description: string;
  tone: string;
}[];
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores.");
export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(32),
  username: usernameSchema,
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
});
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const roomSchema = z
  .object({
    name: z.string().trim().min(1).max(48).default("Friendly rivalry"),
    gameIds: z
      .array(z.enum(gameIds))
      .min(1)
      .max(gameIds.length)
      .default([...gameIds]),
    rounds: z.number().int().min(1).max(20).default(10),
    maxPlayers: z.number().int().min(1).max(8).default(2),
    duration: z
      .union([z.literal(15), z.literal(30), z.literal(45)])
      .default(15),
    ranked: z.boolean().default(false),
    category: z.string().max(40).default("All"),
  })
  .refine(
    (v) => !v.ranked || v.maxPlayers === 2,
    "Ranked rooms must have exactly two player slots.",
  );
export type RoomSettings = z.infer<typeof roomSchema>;
export const answerSchema = z.object({
  code: z.string().min(6).max(12),
  roundId: z.string().uuid(),
  value: z.union([
    z.number().int().min(0).max(3),
    z.string().max(64),
    z.array(z.number().int().min(0).max(3)).max(12),
  ]),
});
export type Answer = z.infer<typeof answerSchema>;
export interface Player {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  points: number;
  rating: number;
  matches: number;
  wins: number;
  level: number;
  achievements: string[];
  role: "player" | "admin";
  visibility: "public" | "private";
}
export interface Account extends Player {
  email: string;
  theme: "system" | "light" | "dark";
}
export type MatchStatus =
  | "waiting"
  | "starting"
  | "playing"
  | "round-results"
  | "completed"
  | "cancelled";
export interface RoundResult {
  round: number;
  gameId: GameId;
  answer: string;
  scores: {
    userId: string;
    points: number;
    correct: boolean;
    detail: string;
  }[];
}
export interface Challenge {
  id: string;
  gameId: GameId;
  prompt: string;
  options?: string[];
  letters?: string;
  sequence?: number[];
  sequenceLength?: number;
  showUntil?: number;
  signalAt?: number;
  expression?: string;
  clues?: { guess: string; placed: number; misplaced: number }[];
  codeLength?: number;
  startedAt: number;
  deadline: number;
}
export interface RoomState {
  id: string;
  code: string;
  hostId: string;
  settings: RoomSettings;
  status: MatchStatus;
  players: (Player & { ready: boolean; connected: boolean; score: number })[];
  round: number;
  challenge: Challenge | null;
  submitted: string[];
  results: RoundResult[];
  serverNow: number;
  nextAt?: number;
  winnerIds: string[];
  persisted: boolean;
  ratingChanges: Record<string, number>;
}
export type Reply<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };
export type Ack<T = undefined> = (reply: Reply<T>) => void;
export interface ClientEvents {
  "room:create": (settings: RoomSettings, ack: Ack<RoomState>) => void;
  "room:join": (payload: { code: string }, ack: Ack<RoomState>) => void;
  "room:sync": (payload: { code?: string }, ack: Ack<RoomState | null>) => void;
  "room:leave": (payload: Record<string, never>, ack: Ack) => void;
  "room:ready": (payload: { ready: boolean }, ack: Ack) => void;
  "match:start": (payload: Record<string, never>, ack: Ack) => void;
  "match:rematch": (payload: Record<string, never>, ack: Ack) => void;
  "answer:submit": (payload: Answer, ack: Ack) => void;
}
export interface ServerEvents {
  "room:state": (room: RoomState) => void;
  "room:error": (message: string) => void;
}
export const achievements = [
  {
    id: "first-match",
    title: "First Match",
    description: "Complete your first match.",
  },
  {
    id: "first-victory",
    title: "First Victory",
    description: "Win a multiplayer match.",
  },
  {
    id: "five-matches",
    title: "Getting warmed up",
    description: "Complete five matches.",
  },
  {
    id: "three-wins",
    title: "On fire",
    description: "Win three multiplayer matches in a row.",
  },
  {
    id: "daily",
    title: "Daily ritual",
    description: "Complete a daily challenge.",
  },
  {
    id: "quiz-master",
    title: "Quiz Master",
    description: "Answer ten quiz questions correctly.",
  },
] as const;
export function speedScore(elapsed: number, duration: number) {
  return (
    100 + Math.round(50 * Math.max(0, Math.min(1, 1 - elapsed / duration)))
  );
}
export function eloDelta(rating: number, opponent: number, outcome: number) {
  return Math.round(
    32 * (outcome - 1 / (1 + 10 ** ((opponent - rating) / 400))),
  );
}
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}
