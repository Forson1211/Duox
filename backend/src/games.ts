import { randomInt, randomUUID } from "node:crypto";
import {
  speedScore,
  type Challenge,
  type GameId,
  type Answer,
} from "@duo-clash/shared";
import { words } from "./content.js";
import { Question } from "./models.js";
import { AppError } from "./auth.js";
import { makeCodePuzzle, makeNumberPuzzle } from "./puzzles.js";
export interface SecretRound {
  challenge: Challenge;
  answer: number | string | number[];
  explanation: string;
  signalAt?: number;
}
export interface ScoredAnswer {
  points: number;
  correct: boolean;
  detail: string;
}
export async function newRound(
  gameId: GameId,
  round: number,
  duration: number,
  category: string,
  now = Date.now(),
  usedPrompts: string[] = [],
): Promise<SecretRound> {
  const c: Challenge = {
    id: randomUUID(),
    gameId,
    prompt: "",
    startedAt: now,
    deadline: now + duration * 1000,
  };
  if (gameId === "quick-quiz") {
    const list = await Question.find({
      active: true,
      ...(category !== "All" ? { category } : {}),
    });
    if (!list.length)
      throw new AppError(
        "No active questions in this category. Choose another category.",
      );
    const unused = list.filter((q) => !usedPrompts.includes(q.prompt));
    const pool = unused.length ? unused : list;
    const q = pool[randomInt(pool.length)];
    c.prompt = q.prompt;
    c.options = [...q.options];
    return { challenge: c, answer: q.answer, explanation: q.explanation ?? "" };
  }
  if (gameId === "memory-rush") {
    const sequence = Array.from(
      { length: Math.min(3 + Math.floor((round - 1) / 2), 9) },
      () => randomInt(4),
    );
    c.prompt = "Remember the tile sequence";
    c.sequence = sequence;
    c.sequenceLength = sequence.length;
    c.showUntil = now + sequence.length * 650 + 700;
    c.deadline += c.showUntil - now;
    return {
      challenge: c,
      answer: sequence,
      explanation: "Tiles are numbered 1 to 4.",
    };
  }
  if (gameId === "word-blitz") {
    const [word, clue] = words[randomInt(words.length)];
    let letters = [...word];
    for (let i = letters.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join("") === word) letters = [...word.slice(1), word[0]];
    c.prompt = clue;
    c.letters = letters.join("");
    return { challenge: c, answer: word, explanation: "" };
  }
  if (gameId === "number-circuit") {
    const puzzle = makeNumberPuzzle(round);
    c.prompt = "Find the missing result.";
    c.expression = puzzle.expression;
    c.options = puzzle.options;
    return {
      challenge: c,
      answer: puzzle.answer,
      explanation:
        "Multiplication and division come before addition and subtraction.",
    };
  }
  if (gameId === "code-breaker") {
    const puzzle = makeCodePuzzle();
    c.prompt = "Crack the three-digit code.";
    c.clues = puzzle.clues;
    c.codeLength = 3;
    c.deadline = now + Math.max(30, duration) * 1000;
    return {
      challenge: c,
      answer: puzzle.code,
      explanation:
        "Digits never repeat. Each clue counts exact positions and correct digits in other positions.",
    };
  }
  c.prompt = "Wait for GO. Do not press early.";
  const signalAt = now + randomInt(2000, 5001);
  c.deadline = signalAt + 5000;
  // The scheduled signal stays private until it is broadcast, so the client cannot pre-schedule a response.
  return {
    challenge: c,
    answer: "GO",
    explanation: "Reaction time includes network latency.",
    signalAt,
  };
}
export function safeChallenge(
  secret: SecretRound,
  now = Date.now(),
): Challenge {
  const c = { ...secret.challenge };
  if (c.showUntil && now >= c.showUntil) delete c.sequence;
  if (secret.signalAt && now >= secret.signalAt) c.signalAt = secret.signalAt;
  return c;
}
export function scoreAnswer(
  secret: SecretRound,
  value: Answer["value"],
  now = Date.now(),
): ScoredAnswer {
  const c = secret.challenge;
  if (now < c.startedAt || now > c.deadline)
    throw new AppError("The answer window is closed.");
  let correct = false;
  let elapsed = now - c.startedAt;
  let duration = c.deadline - c.startedAt;
  let detail = "";
  if (c.gameId === "quick-quiz" || c.gameId === "number-circuit") {
    if (typeof value !== "number") throw new AppError("Choose an answer.");
    correct = value === secret.answer;
  }
  if (c.gameId === "word-blitz") {
    if (typeof value !== "string") throw new AppError("Enter a word.");
    correct = value.normalize("NFKC").trim().toUpperCase() === secret.answer;
  }
  if (c.gameId === "code-breaker") {
    if (
      typeof value !== "string" ||
      !/^\d{3}$/.test(value.normalize("NFKC").trim())
    )
      throw new AppError("Enter exactly three digits.");
    correct = value.normalize("NFKC").trim() === secret.answer;
  }
  if (c.gameId === "memory-rush") {
    if (now < c.showUntil!)
      throw new AppError("Wait until the sequence is hidden.");
    if (!Array.isArray(value)) throw new AppError("Submit a sequence.");
    correct = JSON.stringify(value) === JSON.stringify(secret.answer);
    elapsed = now - c.showUntil!;
    duration = c.deadline - c.showUntil!;
  }
  if (c.gameId === "reflex-race") {
    if (value !== "tap") throw new AppError("Invalid reaction.");
    elapsed = now - secret.signalAt!;
    duration = 5000;
    if (elapsed < 80)
      return {
        correct: false,
        points: 0,
        detail:
          elapsed < 0 ? "False start" : "Below the 80 ms minimum; no points",
      };
    correct = true;
    detail = `${elapsed} ms (includes network latency)`;
  }
  return {
    correct,
    points: correct ? speedScore(elapsed, duration) : 0,
    detail: detail || (correct ? "Correct" : "Incorrect"),
  };
}
export function answerText(secret: SecretRound) {
  const a = secret.answer;
  return Array.isArray(a)
    ? a.map((x) => x + 1).join(" → ")
    : typeof a === "number"
      ? secret.challenge.options![a]
      : a;
}
