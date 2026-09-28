import { parseAnswer, type ParseResult } from "./parse-answer";

export type InterpretConfidence = "high" | "low";

export type InterpretResult = ParseResult & {
  confidence: InterpretConfidence;
};

function tokenCount(transcript: string): number {
  return transcript.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Whether we can commit from a partial transcript without waiting for LLM / final.
 */
export function isConfidentInterim(
  transcript: string,
  parsed: ParseResult,
): boolean {
  if (parsed.kind === "skip" || parsed.kind === "unknown") {
    return true;
  }
  if (parsed.kind !== "answer") {
    return false;
  }

  const trimmed = transcript.trim();
  if (/^\d{1,4}$/.test(trimmed)) {
    return true;
  }

  const words = tokenCount(trimmed);
  if (words <= 2) {
    return true;
  }

  if (/\b(is|equals|that's|thats|oops|sorry|no|wait)\b/i.test(trimmed)) {
    return true;
  }

  return words <= 4;
}

export function interpretAnswerDeterministic(
  transcript: string,
): InterpretResult {
  const parsed = parseAnswer(transcript);
  const confidence = isConfidentInterim(transcript, parsed) ? "high" : "low";
  return { ...parsed, confidence };
}

export function needsLlmFallback(
  transcript: string,
  parsed: ParseResult,
): boolean {
  if (!transcript.trim()) {
    return false;
  }
  if (parsed.kind === "answer" || parsed.kind === "skip" || parsed.kind === "unknown") {
    return false;
  }
  return tokenCount(transcript) >= 6 || parsed.kind === "ambiguous";
}
