export type ParseResult =
  | { kind: "answer"; value: number }
  | { kind: "skip" }
  | { kind: "unknown" }
  | { kind: "ambiguous" }
  | { kind: "unparsed" };

const UNITS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const TEENS: Record<string, number> = {
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

/** Speech-to-text sometimes returns a homophone when a single number is said alone. */
const LONE_HOMOPHONES: Record<string, number> = {
  won: 1,
  to: 2,
  too: 2,
  for: 4,
  ate: 8,
};

const SKIP_WORDS = new Set(["skip", "next", "pass"]);

const UNKNOWN_PHRASES = [
  "i dont know",
  "i do not know",
  "dont know",
  "do not know",
  "no idea",
  "not sure",
  "idk",
];

const FILLER_PHRASES = [
  "let me think",
  "give me a second",
  "give me a sec",
  "one second",
  "one sec",
  "one moment",
  "hang on",
  "um",
  "umm",
  "ummm",
  "uh",
  "uhh",
  "uhm",
  "erm",
  "er",
  "ah",
  "oh",
  "hmm",
  "mmm",
  "mm",
  "like",
];

/** Words that join two numbers into an expression, so neither side is the answer. */
const OPERATORS = new Set(["plus", "minus", "times"]);

const MAX_DIGITS = 6;

function normalize(raw: string): string {
  let text = raw
    .toLowerCase()
    .replace(/['’]/g, "")
    // Thousands separators: "1,234" -> "1234".
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const phrase of FILLER_PHRASES) {
    text = text.replace(new RegExp(`\\b${phrase}\\b`, "g"), " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function tokensOf(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

function isDigits(token: string): boolean {
  return /^\d+$/.test(token) && token.length <= MAX_DIGITS;
}

function startsBelowHundred(token: string | undefined): boolean {
  if (token === undefined) {
    return false;
  }
  if (token in UNITS || token in TEENS || token in TENS) {
    return true;
  }
  return isDigits(token) && Number.parseInt(token, 10) < 100;
}

type NumberPart = "units" | "teen" | "tens" | "hundred" | "thousand" | "digits";

/**
 * What a digit string can combine with, like its spoken form: speech-to-text
 * may return "twenty … one" as "20 one", or "one hundred … twenty three" as "100 23".
 */
function digitsPart(value: number): NumberPart {
  if (value >= 1000 && value % 1000 === 0) {
    return "thousand";
  }
  if (value >= 100 && value % 100 === 0) {
    return "hundred";
  }
  const rest = value % 100;
  if (rest >= 20 && rest % 10 === 0) {
    return "tens";
  }
  if (rest >= 10) {
    return rest <= 19 ? "teen" : "digits";
  }
  return rest >= 1 ? "units" : "digits";
}

type NumberSpan = {
  start: number;
  /** Exclusive. */
  end: number;
  value: number;
};

/**
 * Reads one English number starting at `start`, following real number grammar
 * so that "twenty one" is 21 but "eight fifteen" is two numbers (8, 15).
 */
function readNumber(tokens: string[], start: number): NumberSpan | null {
  let total = 0;
  let chunk = 0;
  let last: NumberPart | null = null;
  let i = start;

  while (i < tokens.length) {
    const token = tokens[i];
    const next = tokens[i + 1];

    if (last === null && token === "a" && (next === "hundred" || next === "thousand")) {
      chunk = 1;
      last = "units";
      i += 1;
      continue;
    }

    if (token === "and") {
      // "one hundred and five": a connector only after a scale word.
      if ((last === "hundred" || last === "thousand") && startsBelowHundred(next)) {
        i += 1;
        continue;
      }
      break;
    }

    if (token === "zero") {
      if (last === null) {
        return { start, end: i + 1, value: 0 };
      }
      break;
    }

    if (token in UNITS) {
      if (last === null || last === "tens" || last === "hundred" || last === "thousand") {
        chunk += UNITS[token];
        last = "units";
        i += 1;
        continue;
      }
      break;
    }

    if (token in TEENS || token in TENS) {
      if (last === null || last === "hundred" || last === "thousand") {
        chunk += token in TEENS ? TEENS[token] : TENS[token];
        last = token in TEENS ? "teen" : "tens";
        i += 1;
        continue;
      }
      break;
    }

    if (token === "hundred") {
      const canScale =
        last === null || last === "units" || last === "teen" || last === "digits";
      if (canScale && chunk < 100) {
        chunk = (chunk === 0 ? 1 : chunk) * 100;
        last = "hundred";
        i += 1;
        continue;
      }
      break;
    }

    if (token === "thousand") {
      if (total === 0 && last !== "thousand" && chunk < 1000) {
        total = (chunk === 0 ? 1 : chunk) * 1000;
        chunk = 0;
        last = "thousand";
        i += 1;
        continue;
      }
      break;
    }

    if (isDigits(token)) {
      const value = Number.parseInt(token, 10);
      const fits =
        last === null ||
        (last === "hundred" && value < 100) ||
        (last === "thousand" && value < 1000) ||
        (last === "tens" && value >= 1 && value <= 9);
      if (!fits) {
        break;
      }
      const part = digitsPart(value);
      if (part === "thousand") {
        total = value;
      } else {
        chunk += value;
      }
      last = part;
      i += 1;
      continue;
    }

    break;
  }

  if (last === null) {
    return null;
  }
  return { start, end: i, value: total + chunk };
}

function findNumberSpans(tokens: string[]): NumberSpan[] {
  const spans: NumberSpan[] = [];
  let i = 0;
  while (i < tokens.length) {
    const span = readNumber(tokens, i);
    if (span) {
      spans.push(span);
      i = span.end;
    } else {
      i += 1;
    }
  }
  return spans;
}

/**
 * A number that is part of an arithmetic expression ("seven plus eight",
 * "40 and 20") is the user thinking aloud or the question prompt leaking into
 * the mic, not their answer.
 */
function isOperand(span: NumberSpan, spans: NumberSpan[], tokens: string[]): boolean {
  const before = tokens[span.start - 1];
  const after = tokens[span.end];
  if ((before && OPERATORS.has(before)) || (after && OPERATORS.has(after))) {
    return true;
  }
  const joinedBefore =
    before === "and" && spans.some((other) => other.end === span.start - 1);
  const joinedAfter =
    after === "and" && spans.some((other) => other.start === span.end + 1);
  return joinedBefore || joinedAfter;
}

type Analysis = {
  tokens: string[];
  candidate: NumberSpan | null;
  ambiguous: boolean;
};

function analyze(transcript: string): Analysis {
  const tokens = tokensOf(normalize(transcript));

  if (tokens.length === 1 && tokens[0] in LONE_HOMOPHONES) {
    return {
      tokens,
      candidate: { start: 0, end: 1, value: LONE_HOMOPHONES[tokens[0]] },
      ambiguous: false,
    };
  }

  const spans = findNumberSpans(tokens);
  const candidates = spans.filter(
    (span) => tokens[span.start - 1] !== "not" && !isOperand(span, spans, tokens),
  );
  const candidate = candidates[candidates.length - 1] ?? null;

  // "fifteen or sixteen" with no later choice.
  const ambiguous =
    candidate != null &&
    tokens[candidate.start - 1] === "or" &&
    spans.some((other) => other.end === candidate.start - 1);

  return { tokens, candidate, ambiguous };
}

/** Parse a phrase that should be exactly one number ("twenty one", "434"), or null. */
export function parseNumberPhrase(phrase: string): number | null {
  const tokens = tokensOf(normalize(phrase));
  if (tokens.length === 0) {
    return null;
  }
  const span = readNumber(tokens, 0);
  return span && span.end === tokens.length ? span.value : null;
}

/**
 * Interpret a speech transcript into an answer intent. Deterministic — the
 * spoken words decide the answer; nothing here knows the correct result.
 */
export function parseAnswer(transcript: string): ParseResult {
  const { tokens, candidate, ambiguous } = analyze(transcript);
  if (tokens.length === 0) {
    return { kind: "unparsed" };
  }

  if (SKIP_WORDS.has(tokens[0])) {
    return { kind: "skip" };
  }

  let lastSkip = -1;
  tokens.forEach((token, index) => {
    if (SKIP_WORDS.has(token)) {
      lastSkip = index;
    }
  });

  if (candidate) {
    if (lastSkip >= candidate.end) {
      return { kind: "skip" };
    }
    if (ambiguous) {
      return { kind: "ambiguous" };
    }
    return { kind: "answer", value: candidate.value };
  }

  if (lastSkip >= 0) {
    return { kind: "skip" };
  }

  const text = tokens.join(" ");
  if (UNKNOWN_PHRASES.some((phrase) => new RegExp(`\\b${phrase}\\b`).test(text))) {
    return { kind: "unknown" };
  }

  return { kind: "unparsed" };
}

/**
 * True when the answer in the transcript may not be finished yet: the number
 * could still grow ("twenty…", "one hundred…") or words follow it, which is
 * how corrections start ("fifty, oops…") even when the cue word is misheard.
 */
export function endsMidAnswer(transcript: string): boolean {
  const { tokens, candidate } = analyze(transcript);
  if (!candidate) {
    return false;
  }
  if (candidate.end < tokens.length) {
    return true;
  }
  const last = tokens[candidate.end - 1];
  if (last in TENS || last === "hundred" || last === "thousand") {
    return true;
  }
  if (isDigits(last)) {
    const value = Number.parseInt(last, 10);
    // 20, 30, 100, 120, 2000… can still grow; 10, 110, 15, 21 cannot.
    return value >= 20 && value % 10 === 0 && value % 100 !== 10;
  }
  return false;
}
