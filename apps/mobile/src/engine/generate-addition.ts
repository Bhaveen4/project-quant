import { createRng, randomInt, type Rng } from "./rng";
import { speakAddends } from "./speak-number";
import {
  MAX_DIGITS,
  MAX_ROWS,
  MIN_DIGITS,
  MIN_ROWS,
  MIXED_MAX_ADDENDS,
  MIXED_MIN_ADDENDS,
  type AdditionQuestion,
  type SessionSettings,
} from "./types";

export function digitRange(digits: number): { min: number; max: number } {
  if (digits === 1) {
    return { min: 1, max: 9 };
  }
  return { min: 10 ** (digits - 1), max: 10 ** digits - 1 };
}

function randomAddend(rng: Rng, digits: number): number {
  const { min, max } = digitRange(digits);
  return randomInt(rng, min, max);
}

function addendKey(addends: number[]): string {
  return [...addends].sort((a, b) => a - b).join(",");
}

function generateAddends(rng: Rng, settings: SessionSettings): number[] {
  if (settings.mixed) {
    const count = randomInt(rng, MIXED_MIN_ADDENDS, MIXED_MAX_ADDENDS);
    return Array.from({ length: count }, () =>
      randomAddend(rng, randomInt(rng, MIN_DIGITS, MAX_DIGITS)),
    );
  }

  const count = settings.rows + 1;
  return Array.from({ length: count }, () => randomAddend(rng, settings.digits));
}

export function generateQuestion(
  seed: string,
  settings: SessionSettings,
  index: number,
  previousKey?: string,
): AdditionQuestion {
  const rng = createRng(`${seed}:${index}`);
  let addends = generateAddends(rng, settings);
  if (previousKey && addendKey(addends) === previousKey) {
    addends = generateAddends(createRng(`${seed}:${index}:retry`), settings);
  }

  const correctAnswer = addends.reduce((sum, n) => sum + n, 0);
  return {
    id: `${seed}-${index}`,
    seed: `${seed}:${index}`,
    addends,
    correctAnswer,
    mixed: settings.mixed,
    digits: settings.mixed ? undefined : settings.digits,
    rows: settings.mixed ? undefined : settings.rows,
    promptSpoken: speakAddends(addends),
  };
}

export function generateQuestions(
  seed: string,
  settings: SessionSettings,
): AdditionQuestion[] {
  const questions: AdditionQuestion[] = [];
  let previousKey: string | undefined;
  for (let i = 0; i < settings.questionCount; i += 1) {
    const question = generateQuestion(seed, settings, i, previousKey);
    questions.push(question);
    previousKey = addendKey(question.addends);
  }
  return questions;
}

export function assertSettings(settings: SessionSettings): void {
  if (
    !Number.isInteger(settings.questionCount) ||
    settings.questionCount < 1 ||
    settings.questionCount > 200
  ) {
    throw new Error("questionCount must be an integer from 1 to 200");
  }
  if (!settings.mixed) {
    if (settings.digits < MIN_DIGITS || settings.digits > MAX_DIGITS) {
      throw new Error("digits must be 1, 2, or 3");
    }
    if (settings.rows < MIN_ROWS || settings.rows > MAX_ROWS) {
      throw new Error("rows must be 1, 2, or 3");
    }
  }
}
