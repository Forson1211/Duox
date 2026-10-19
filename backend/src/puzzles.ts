import { randomInt } from "node:crypto";
export interface CodeClue {
  guess: string;
  placed: number;
  misplaced: number;
}
const candidates = Array.from({ length: 1000 }, (_, n) =>
  String(n).padStart(3, "0"),
).filter((code) => new Set(code).size === 3);
export function evaluateCode(code: string, guess: string) {
  const placed = [...guess].filter(
    (digit, index) => code[index] === digit,
  ).length;
  const shared = [...guess].filter((digit) => code.includes(digit)).length;
  return { placed, misplaced: shared - placed };
}
export function solveCode(clues: CodeClue[]) {
  return candidates.filter((code) =>
    clues.every((clue) => {
      const result = evaluateCode(code, clue.guess);
      return (
        result.placed === clue.placed && result.misplaced === clue.misplaced
      );
    }),
  );
}
export function makeCodePuzzle() {
  const code = candidates[randomInt(candidates.length)];
  const clues: CodeClue[] = [];
  let possible = [...candidates];
  while (possible.length > 1 || clues.length < 3) {
    let best: CodeClue | undefined;
    let bestRemaining = Infinity;
    for (let i = 0; i < 70; i++) {
      const guess = candidates[randomInt(candidates.length)];
      if (guess === code || clues.some((clue) => clue.guess === guess))
        continue;
      const result = evaluateCode(code, guess);
      const remaining = possible.filter((candidate) => {
        const check = evaluateCode(candidate, guess);
        return (
          check.placed === result.placed && check.misplaced === result.misplaced
        );
      }).length;
      if (remaining < bestRemaining) {
        best = { guess, ...result };
        bestRemaining = remaining;
      }
    }
    if (!best) continue;
    clues.push(best);
    possible = solveCode(clues);
    if (clues.length >= 7 && possible.length > 1) {
      // A near-solution clue guarantees progress without revealing the full code.
      const other = possible.find((candidate) => candidate !== code)!;
      const clue = { guess: other, ...evaluateCode(code, other) };
      clues.push(clue);
      possible = solveCode(clues);
    }
  }
  return { code, clues };
}
export function makeNumberPuzzle(round: number) {
  const a = randomInt(2, 13),
    b = randomInt(2, 13),
    c = randomInt(2, 10);
  const kind = round >= 5 ? randomInt(5) : randomInt(4);
  let expression: string, answer: number;
  switch (kind) {
    case 0:
      expression = `${a * 2} + ${b}`;
      answer = a * 2 + b;
      break;
    case 1:
      expression = `${a + b} \u2212 ${b}`;
      answer = a;
      break;
    case 2:
      expression = `${a} \u00d7 ${b}`;
      answer = a * b;
      break;
    case 3:
      expression = `${a * b} \u00f7 ${a}`;
      answer = b;
      break;
    default:
      expression = `${a} \u00d7 ${b} + ${c}`;
      answer = a * b + c;
  }
  const choices = new Set([answer]);
  while (choices.size < 4) choices.add(answer + randomInt(-9, 10));
  const options = [...choices];
  for (let i = options.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    expression,
    options: options.map(String),
    answer: options.indexOf(answer),
  };
}
