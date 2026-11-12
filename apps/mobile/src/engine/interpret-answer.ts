import { endsMidAnswer, parseAnswer } from "./parse-answer";

export type SubmittedAnswer = { kind: "answer"; value: number } | { kind: "skip" };

export type UtteranceDecision =
  /** A complete answer or skip: submit it now. */
  | { action: "submit"; result: SubmittedAnswer }
  /** Sounds unfinished ("twenty…", "fifty, oops…"): submit `value` only if nothing follows. */
  | { action: "wait"; value: number }
  /** No usable answer ("I don't know", "15 or 16"): ask the user again. */
  | { action: "reprompt"; reason: "unknown" | "ambiguous" }
  /** Nothing to act on yet (filler, thinking aloud, question echo). */
  | { action: "none" };

/** Decide what to do with everything the user has said so far this round. */
export function interpretUtterance(transcript: string): UtteranceDecision {
  const parsed = parseAnswer(transcript);
  switch (parsed.kind) {
    case "skip":
      return { action: "submit", result: parsed };
    case "answer":
      return endsMidAnswer(transcript)
        ? { action: "wait", value: parsed.value }
        : { action: "submit", result: parsed };
    case "unknown":
    case "ambiguous":
      return { action: "reprompt", reason: parsed.kind };
    case "unparsed":
      return { action: "none" };
  }
}
