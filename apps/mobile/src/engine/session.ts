import { generateQuestions, assertSettings } from "./generate-addition";
import type {
  Attempt,
  AttemptOutcome,
  PracticeSession,
  SessionSettings,
} from "./types";

export function currentQuestion(
  session: PracticeSession,
): PracticeSession["questions"][number] | null {
  return session.questions[session.currentIndex] ?? null;
}

export function isSessionComplete(session: PracticeSession): boolean {
  return session.currentIndex >= session.questions.length;
}

export function shouldCommitTypedAnswer(
  typed: string,
  correctAnswer: number,
): boolean {
  if (typed.length === 0) {
    return false;
  }
  return typed.length === String(correctAnswer).length;
}

export function parseTypedAnswer(typed: string): number {
  return Number.parseInt(typed, 10);
}

export function createSession(
  settings: SessionSettings,
  seed: string,
): PracticeSession {
  assertSettings(settings);
  return {
    settings,
    seed,
    questions: generateQuestions(seed, settings),
    attempts: [],
    currentIndex: 0,
  };
}

function appendAttempt(
  session: PracticeSession,
  attempt: Attempt,
): PracticeSession {
  return {
    ...session,
    attempts: [...session.attempts, attempt],
    currentIndex: session.currentIndex + 1,
  };
}

export function commitAnswer(
  session: PracticeSession,
  questionId: string,
  givenAnswer: number,
  responseTimeMs: number,
): PracticeSession {
  const question = currentQuestion(session);
  if (!question || question.id !== questionId) {
    return session;
  }

  const outcome: AttemptOutcome =
    givenAnswer === question.correctAnswer ? "correct" : "wrong";

  return appendAttempt(session, {
    question,
    givenAnswer,
    outcome,
    responseTimeMs,
  });
}

export function skipQuestion(
  session: PracticeSession,
  questionId: string,
  responseTimeMs: number,
): PracticeSession {
  const question = currentQuestion(session);
  if (!question || question.id !== questionId) {
    return session;
  }

  return appendAttempt(session, {
    question,
    givenAnswer: null,
    outcome: "skipped",
    responseTimeMs,
  });
}

export function sessionStats(session: PracticeSession): {
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  medianResponseTimeMs: number | null;
} {
  const answered = session.attempts.filter((a) => a.outcome !== "skipped");
  const correct = session.attempts.filter((a) => a.outcome === "correct").length;
  const wrong = session.attempts.filter((a) => a.outcome === "wrong").length;
  const skipped = session.attempts.filter((a) => a.outcome === "skipped").length;
  const times = answered
    .map((a) => a.responseTimeMs)
    .slice()
    .sort((a, b) => a - b);
  const median =
    times.length === 0
      ? null
      : times.length % 2 === 1
        ? times[(times.length - 1) / 2]
        : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2);

  return {
    total: session.attempts.length,
    correct,
    wrong,
    skipped,
    accuracy: answered.length === 0 ? 0 : correct / answered.length,
    medianResponseTimeMs: median,
  };
}
