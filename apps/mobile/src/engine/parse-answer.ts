export type ParseResult =
  | { kind: "answer"; value: number }
  | { kind: "skip" }
  | { kind: "unknown" }
  | { kind: "ambiguous" }
  | { kind: "unparsed" };

const ONES: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SKIP_PHRASES = ["skip", "next", "pass"];
const UNKNOWN_PHRASES = [
  "i dont know",
  "i do not know",
  "dont know",
  "do not know",
  "no idea",
  "not sure",
  "idk",
];

const CORRECTION_CUES = [
  "no",
  "nope",
  "sorry",
  "wait",
  "actually",
  "i mean",
  "correction",
];

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

/** Parse a sequence of English number words / digits into an integer, or null. */
export function parseNumberPhrase(phrase: string): number | null {
  const tokens = tokensOf(normalize(phrase));
  if (tokens.length === 0) {
    return null;
  }

  // Pure digit string (possibly with spaces already stripped by normalize)
  if (tokens.every((t) => /^\d+$/.test(t))) {
    const joined = tokens.join("");
    if (joined.length > 6) {
      return null;
    }
    return Number.parseInt(joined, 10);
  }

  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      current += Number.parseInt(token, 10);
      sawNumber = true;
      continue;
    }
    if (token in ONES) {
      current += ONES[token];
      sawNumber = true;
      continue;
    }
    if (token in TENS) {
      current += TENS[token];
      sawNumber = true;
      continue;
    }
    if (token === "hundred") {
      current = (current === 0 ? 1 : current) * 100;
      sawNumber = true;
      continue;
    }
    if (token === "thousand") {
      current = (current === 0 ? 1 : current) * 1000;
      total += current;
      current = 0;
      sawNumber = true;
      continue;
    }
    if (token === "and") {
      continue;
    }
    return null;
  }

  if (!sawNumber) {
    return null;
  }
  return total + current;
}

function extractNumberSpans(tokens: string[]): string[] {
  const spans: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length > 0) {
      spans.push(buf.join(" "));
      buf = [];
    }
  };

  for (const token of tokens) {
    const isNum =
      /^\d+$/.test(token) ||
      token in ONES ||
      token in TENS ||
      token === "hundred" ||
      token === "thousand" ||
      token === "and";
    if (isNum) {
      buf.push(token);
    } else {
      flush();
    }
  }
  flush();
  return spans;
}

function isCue(token: string): boolean {
  return CORRECTION_CUES.includes(token);
}

/**
 * Interpret a speech transcript into an answer intent.
 * Deterministic only — no LLM.
 */
export function parseAnswer(transcript: string): ParseResult {
  const normalized = normalize(transcript);
  if (!normalized) {
    return { kind: "unparsed" };
  }

  if (SKIP_PHRASES.some((p) => normalized === p || normalized.startsWith(`${p} `))) {
    return { kind: "skip" };
  }

  if (UNKNOWN_PHRASES.some((p) => normalized.includes(p))) {
    return { kind: "unknown" };
  }

  // "10 or 20", "fifteen or sixteen"
  if (/\bor\b/.test(normalized)) {
    const parts = normalized.split(/\bor\b/).map((p) => p.trim());
    const nums = parts
      .map((p) => parseNumberPhrase(p))
      .filter((n): n is number => n != null);
    if (nums.length >= 2) {
      return { kind: "ambiguous" };
    }
  }

  const tokens = tokensOf(normalized);

  // Correction: take the number after the last correction cue when present.
  let lastCue = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (isCue(tokens[i])) {
      lastCue = i;
    }
  }
  if (lastCue >= 0) {
    const after = tokens.slice(lastCue + 1).join(" ");
    const value = parseNumberPhrase(after);
    if (value != null) {
      return { kind: "answer", value };
    }
    // "no" alone etc. — fall through
  }

  const spans = extractNumberSpans(tokens);
  if (spans.length === 0) {
    return { kind: "unparsed" };
  }

  // Multiple number spans without a correction cue → prefer the last spoken number
  // ("umm twenty one" has one span; "200 sorry 20" is handled via cue above).
  const value = parseNumberPhrase(spans[spans.length - 1]);
  if (value == null) {
    return { kind: "unparsed" };
  }
  return { kind: "answer", value };
}
