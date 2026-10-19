import { describe, it, expect } from "vitest";
import { makeCodePuzzle, makeNumberPuzzle, solveCode } from "../src/puzzles.js";
import { newRound, safeChallenge, scoreAnswer } from "../src/games.js";
describe("generated mind games", () => {
  it("generates distinct codes with exactly one solution and no revealing clue", () => {
    const generated = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const puzzle = makeCodePuzzle();
      expect(solveCode(puzzle.clues)).toEqual([puzzle.code]);
      expect(new Set(puzzle.code).size).toBe(3);
      expect(puzzle.clues.length).toBeGreaterThanOrEqual(3);
      expect(puzzle.clues.length).toBeLessThanOrEqual(9);
      expect(puzzle.clues.some((clue) => clue.guess === puzzle.code)).toBe(
        false,
      );
      generated.add(puzzle.code);
    }
    expect(generated.size).toBeGreaterThan(65);
  });
  it("offers four distinct numeric choices with the correct arithmetic answer", () => {
    for (let i = 0; i < 200; i++) {
      const puzzle = makeNumberPuzzle(i);
      const tokens = puzzle.expression.split(" ");
      const a = Number(tokens[0]),
        b = Number(tokens[2]);
      const expected =
        tokens[1] === "+"
          ? a + b
          : tokens[1] === "\u2212"
            ? a - b
            : tokens[1] === "\u00d7"
              ? a * b
              : a / b;
      const result =
        tokens.length === 5 ? expected + Number(tokens[4]) : expected;
      expect(new Set(puzzle.options).size).toBe(4);
      expect(Number(puzzle.options[puzzle.answer])).toBe(result);
    }
  });
  for (const gameId of ["number-circuit", "code-breaker"] as const) {
    it(
      "validates " + gameId + " on the server and hides its answer",
      async () => {
        const round = await newRound(gameId, 1, 15, "All", 1000);
        const challenge = safeChallenge(round, 1000);
        expect(challenge).not.toHaveProperty("answer");
        expect(
          scoreAnswer(round, round.answer, 1500).points,
        ).toBeGreaterThanOrEqual(100);
        expect(() =>
          scoreAnswer(round, round.answer, round.challenge.deadline + 1),
        ).toThrow("closed");
        if (gameId === "code-breaker") {
          expect(round.challenge.deadline).toBe(31000);
          expect(() => scoreAnswer(round, "12", 1500)).toThrow("three digits");
        }
      },
    );
  }
});
