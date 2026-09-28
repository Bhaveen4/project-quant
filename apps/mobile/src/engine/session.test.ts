import { describe, expect, it } from "vitest";

import { digitRange, generateQuestions } from "./generate-addition";
import {
  commitAnswer,
  createSession,
  currentQuestion,
  parseTypedAnswer,
  sessionStats,
  shouldCommitTypedAnswer,
  skipQuestion,
} from "./session";
import { speakNumber } from "./speak-number";
import type { SessionSettings } from "./types";

const fixed: SessionSettings = {
  mixed: false,
  digits: 1,
  rows: 1,
  questionCount: 20,
  inputMode: "typed",
};

describe("generateQuestions", () => {
  it("uses two 1-digit addends for 1 digit and 1 row", () => {
    const questions = generateQuestions("seed-a", {
      ...fixed,
      digits: 1,
      rows: 1,
      questionCount: 30,
    });
    for (const q of questions) {
      expect(q.addends).toHaveLength(2);
      for (const n of q.addends) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(9);
      }
      expect(q.correctAnswer).toBe(q.addends[0] + q.addends[1]);
    }
  });

  it("uses three 2-digit addends for 2 digits and 2 rows", () => {
    const questions = generateQuestions("seed-b", {
      mixed: false,
      digits: 2,
      rows: 2,
      questionCount: 20,
      inputMode: "typed",
    });
    const { min, max } = digitRange(2);
    for (const q of questions) {
      expect(q.addends).toHaveLength(3);
      for (const n of q.addends) {
        expect(n).toBeGreaterThanOrEqual(min);
        expect(n).toBeLessThanOrEqual(max);
      }
      expect(q.correctAnswer).toBe(q.addends.reduce((a, b) => a + b, 0));
    }
  });

  it("can produce mixed addend counts and digit widths", () => {
    const questions = generateQuestions("seed-mixed", {
      mixed: true,
      digits: 1,
      rows: 1,
      questionCount: 80,
      inputMode: "typed",
    });
    const counts = new Set(questions.map((q) => q.addends.length));
    const widths = new Set(
      questions.flatMap((q) => q.addends.map((n) => String(n).length)),
    );
    expect(counts.size).toBeGreaterThan(1);
    expect(widths.size).toBeGreaterThan(1);
    for (const q of questions) {
      expect(q.addends.length).toBeGreaterThanOrEqual(2);
      expect(q.addends.length).toBeLessThanOrEqual(4);
      expect(q.correctAnswer).toBe(q.addends.reduce((a, b) => a + b, 0));
    }
  });

  it("replays the same paper for the same seed", () => {
    const settings: SessionSettings = {
      mixed: false,
      digits: 2,
      rows: 1,
      questionCount: 12,
      inputMode: "typed",
    };
    const a = generateQuestions("replay", settings);
    const b = generateQuestions("replay", settings);
    expect(a.map((q) => q.addends)).toEqual(b.map((q) => q.addends));
  });
});

describe("typed commit", () => {
  it("does not commit a prefix of a longer answer", () => {
    expect(shouldCommitTypedAnswer("1", 15)).toBe(false);
    expect(shouldCommitTypedAnswer("15", 15)).toBe(true);
  });

  it("commits a 1-digit answer after one digit", () => {
    expect(shouldCommitTypedAnswer("8", 8)).toBe(true);
    expect(shouldCommitTypedAnswer("", 8)).toBe(false);
  });

  it("parses the typed decimal string", () => {
    expect(parseTypedAnswer("015")).toBe(15);
    expect(parseTypedAnswer("88")).toBe(88);
  });
});

describe("session", () => {
  it("creates the requested number of questions", () => {
    const session = createSession({ ...fixed, questionCount: 50 }, "n-50");
    expect(session.questions).toHaveLength(50);
  });

  it("records a miss and advances without changing the stored correct answer", () => {
    const session = createSession({ ...fixed, questionCount: 3 }, "miss");
    const question = currentQuestion(session);
    expect(question).not.toBeNull();
    const next = commitAnswer(session, question!.id, question!.correctAnswer + 1, 400);
    expect(next.attempts[0].outcome).toBe("wrong");
    expect(next.attempts[0].givenAnswer).toBe(question!.correctAnswer + 1);
    expect(next.attempts[0].question.correctAnswer).toBe(question!.correctAnswer);
    expect(next.currentIndex).toBe(1);
  });

  it("ignores a stale question id", () => {
    const session = createSession({ ...fixed, questionCount: 2 }, "stale");
    const first = currentQuestion(session)!;
    const after = commitAnswer(session, first.id, first.correctAnswer, 100);
    const ignored = commitAnswer(after, first.id, 0, 100);
    expect(ignored.attempts).toHaveLength(1);
    expect(ignored.currentIndex).toBe(1);
  });

  it("records skips separately from misses", () => {
    const session = createSession({ ...fixed, questionCount: 2 }, "skip");
    const question = currentQuestion(session)!;
    const next = skipQuestion(session, question.id, 50);
    expect(next.attempts[0].outcome).toBe("skipped");
    expect(next.attempts[0].givenAnswer).toBeNull();
    const stats = sessionStats(next);
    expect(stats.skipped).toBe(1);
    expect(stats.wrong).toBe(0);
    expect(stats.accuracy).toBe(0);
  });

  it("computes accuracy from answered questions only", () => {
    let session = createSession({ ...fixed, questionCount: 3 }, "acc");
    const q0 = currentQuestion(session)!;
    session = commitAnswer(session, q0.id, q0.correctAnswer, 200);
    const q1 = currentQuestion(session)!;
    session = commitAnswer(session, q1.id, q1.correctAnswer + 3, 300);
    const q2 = currentQuestion(session)!;
    session = skipQuestion(session, q2.id, 10);
    const stats = sessionStats(session);
    expect(stats.correct).toBe(1);
    expect(stats.wrong).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.accuracy).toBe(0.5);
    expect(stats.medianResponseTimeMs).toBe(250);
  });
});

describe("speakNumber", () => {
  it("covers the drill range", () => {
    expect(speakNumber(7)).toBe("seven");
    expect(speakNumber(21)).toBe("twenty-one");
    expect(speakNumber(100)).toBe("one hundred");
    expect(speakNumber(434)).toBe("four hundred thirty-four");
  });
});
