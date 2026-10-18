import { describe, it, expect } from "vitest";
import { speedScore, eloDelta, weekStart, roomSchema } from "@duo-clash/shared";
import {
  scoreAnswer,
  safeChallenge,
  newRound,
  type SecretRound,
} from "../src/games.js";
import { hashPassword, verifyPassword } from "../src/auth.js";
const base: SecretRound = {
  challenge: {
    id: "round",
    gameId: "quick-quiz",
    prompt: "Test",
    options: ["A", "B", "C", "D"],
    startedAt: 1000,
    deadline: 16000,
  },
  answer: 2,
  explanation: "test",
};
describe("server-owned game rules", () => {
  it("bounds correct-answer speed scores", () => {
    expect(speedScore(0, 15000)).toBe(150);
    expect(speedScore(15000, 15000)).toBe(100);
    expect(speedScore(-100, 15000)).toBe(150);
    expect(speedScore(99999, 15000)).toBe(100);
  });
  it("checks quiz answers and rejects expired answers", () => {
    expect(scoreAnswer(base, 2, 1100).points).toBe(150);
    expect(scoreAnswer(base, 0, 1100).points).toBe(0);
    expect(() => scoreAnswer(base, 2, 16001)).toThrow("closed");
    expect(() => scoreAnswer(base, "2", 1100)).toThrow("Choose");
  });
  it("does not expose the quiz answer or explanation", () => {
    expect(safeChallenge(base)).not.toHaveProperty("answer");
    expect(safeChallenge(base)).not.toHaveProperty("explanation");
  });
  it("requires memory submissions after viewing and validates order", () => {
    const s: SecretRound = {
      ...base,
      challenge: {
        ...base.challenge,
        gameId: "memory-rush",
        sequence: [2, 0, 3],
        showUntil: 4000,
      },
      answer: [2, 0, 3],
    };
    expect(() => scoreAnswer(s, [2, 0, 3], 3000)).toThrow("hidden");
    expect(scoreAnswer(s, [2, 0, 3], 5000).correct).toBe(true);
    expect(scoreAnswer(s, [0, 2, 3], 5000).correct).toBe(false);
    expect(safeChallenge(s, 3000).sequence).toEqual([2, 0, 3]);
    expect(safeChallenge(s, 4000)).not.toHaveProperty("sequence");
  });
  it("normalizes word answers without accepting arbitrary suffixes", () => {
    const s: SecretRound = {
      ...base,
      challenge: { ...base.challenge, gameId: "word-blitz" },
      answer: "PURPLE",
    };
    expect(scoreAnswer(s, "  purple ", 2000).correct).toBe(true);
    expect(scoreAnswer(s, "PURPLE!", 2000).correct).toBe(false);
  });
  it("penalizes reflex false starts and machine-speed reactions", () => {
    const s: SecretRound = {
      ...base,
      challenge: { ...base.challenge, gameId: "reflex-race" },
      answer: "GO",
      signalAt: 4000,
    };
    expect(scoreAnswer(s, "tap", 3900)).toMatchObject({
      points: 0,
      correct: false,
      detail: "False start",
    });
    expect(scoreAnswer(s, "tap", 4050).points).toBe(0);
    expect(scoreAnswer(s, "tap", 4300).correct).toBe(true);
    expect(safeChallenge(s, 3900)).not.toHaveProperty("signalAt");
    expect(safeChallenge(s, 4000).signalAt).toBe(4000);
  });
  it("generates varied memory challenges and scrambled words", async () => {
    const seq = await Promise.all(
      Array.from({ length: 8 }, () => newRound("memory-rush", 1, 15, "All")),
    );
    expect(
      new Set(seq.map((s) => JSON.stringify(s.answer))).size,
    ).toBeGreaterThan(1);
    for (let i = 0; i < 10; i++) {
      const w = await newRound("word-blitz", 1, 15, "All");
      expect([...w.challenge.letters!].sort()).toEqual(
        [...(w.answer as string)].sort(),
      );
      expect(w.challenge.letters).not.toBe(w.answer);
    }
  });
  it("uses Monday UTC boundaries across year changes", () => {
    expect(weekStart(new Date("2026-01-04T23:59:59Z")).toISOString()).toBe(
      "2025-12-29T00:00:00.000Z",
    );
    expect(weekStart(new Date("2026-10-19T00:00:00Z")).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z",
    );
  });
  it("calculates symmetric Elo changes and restricts ranked rooms", () => {
    expect(eloDelta(1000, 1000, 1)).toBe(16);
    expect(eloDelta(1000, 1000, 0)).toBe(-16);
    expect(eloDelta(1000, 1000, 0.5)).toBe(0);
    expect(roomSchema.safeParse({ ranked: true, maxPlayers: 4 }).success).toBe(
      false,
    );
  });
  it("hashes passwords with independent salts and verifies safely", async () => {
    const a = await hashPassword("secure-password");
    const b = await hashPassword("secure-password");
    expect(a).not.toContain("secure-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("secure-password", a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
  });
});
