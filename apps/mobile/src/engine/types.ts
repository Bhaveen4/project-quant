export type InputMode = "typed" | "voice";

export type SessionSettings = {
  mixed: boolean;
  digits: number;
  rows: number;
  questionCount: number;
  inputMode: InputMode;
};

export type AdditionQuestion = {
  id: string;
  seed: string;
  addends: number[];
  correctAnswer: number;
  mixed: boolean;
  digits?: number;
  rows?: number;
  promptSpoken: string;
};

export type AttemptOutcome = "correct" | "wrong" | "skipped";

export type Attempt = {
  question: AdditionQuestion;
  givenAnswer: number | null;
  outcome: AttemptOutcome;
  responseTimeMs: number;
};

export type PracticeSession = {
  settings: SessionSettings;
  seed: string;
  questions: AdditionQuestion[];
  attempts: Attempt[];
  currentIndex: number;
};

export const MIN_DIGITS = 1;
export const MAX_DIGITS = 3;
export const MIN_ROWS = 1;
export const MAX_ROWS = 3;
export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 200;
export const MIXED_MIN_ADDENDS = 2;
export const MIXED_MAX_ADDENDS = 4;
