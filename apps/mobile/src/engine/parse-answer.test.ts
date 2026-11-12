import { describe, expect, it } from "vitest";

import { endsMidAnswer, parseAnswer, parseNumberPhrase } from "./parse-answer";

describe("parseNumberPhrase", () => {
  it("parses digits and english words", () => {
    expect(parseNumberPhrase("15")).toBe(15);
    expect(parseNumberPhrase("fifteen")).toBe(15);
    expect(parseNumberPhrase("twenty one")).toBe(21);
    expect(parseNumberPhrase("twenty-one")).toBe(21);
    expect(parseNumberPhrase("one hundred")).toBe(100);
    expect(parseNumberPhrase("four hundred thirty four")).toBe(434);
    expect(parseNumberPhrase("one thousand")).toBe(1000);
  });

  it("follows number grammar instead of summing every number word", () => {
    expect(parseNumberPhrase("a hundred and five")).toBe(105);
    expect(parseNumberPhrase("one hundred twenty three")).toBe(123);
    expect(parseNumberPhrase("three thousand nine hundred ninety six")).toBe(3996);
    expect(parseNumberPhrase("two thousand and five")).toBe(2005);
    expect(parseNumberPhrase("nineteen hundred")).toBe(1900);
    expect(parseNumberPhrase("1,234")).toBe(1234);
    expect(parseNumberPhrase("eight fifteen")).toBeNull();
    expect(parseNumberPhrase("fifteen sixteen")).toBeNull();
    expect(parseNumberPhrase("15 16")).toBeNull();
    expect(parseNumberPhrase("seven plus eight")).toBeNull();
  });

  it("joins digits and words the way they would be spoken", () => {
    // Speech-to-text formats each pause-separated segment on its own.
    expect(parseNumberPhrase("20 one")).toBe(21);
    expect(parseNumberPhrase("20 1")).toBe(21);
    expect(parseNumberPhrase("100 23")).toBe(123);
    expect(parseNumberPhrase("100 twenty three")).toBe(123);
    expect(parseNumberPhrase("120 3")).toBe(123);
    expect(parseNumberPhrase("1000 200")).toBe(1200);
    expect(parseNumberPhrase("2,000 and 5")).toBe(2005);
    expect(parseNumberPhrase("110 5")).toBeNull();
    expect(parseNumberPhrase("100 200")).toBeNull();
    expect(parseNumberPhrase("20 30")).toBeNull();
  });
});

describe("parseAnswer", () => {
  it("returns a confident answer", () => {
    expect(parseAnswer("fifteen")).toEqual({ kind: "answer", value: 15 });
    expect(parseAnswer("Twenty-One!")).toEqual({ kind: "answer", value: 21 });
    expect(parseAnswer("88")).toEqual({ kind: "answer", value: 88 });
  });

  it("applies correction cues", () => {
    expect(parseAnswer("20 no 21")).toEqual({ kind: "answer", value: 21 });
    expect(parseAnswer("200, sorry, 20")).toEqual({ kind: "answer", value: 20 });
    expect(parseAnswer("twenty no twenty one")).toEqual({ kind: "answer", value: 21 });
    expect(parseAnswer("10 oh no 13")).toEqual({ kind: "answer", value: 13 });
    expect(parseAnswer("50 oops 60")).toEqual({ kind: "answer", value: 60 });
    expect(parseAnswer("31 oh wait let me think 14")).toEqual({
      kind: "answer",
      value: 14,
    });
  });

  it("extracts final asserted answer from thinking aloud", () => {
    expect(parseAnswer("40 plus 20 mmm 60, 60 plus 3 is 63")).toEqual({
      kind: "answer",
      value: 63,
    });
  });

  it("treats skip and pass as skip", () => {
    expect(parseAnswer("skip")).toEqual({ kind: "skip" });
    expect(parseAnswer("next")).toEqual({ kind: "skip" });
    expect(parseAnswer("pass")).toEqual({ kind: "skip" });
  });

  it("detects unknown", () => {
    expect(parseAnswer("I don't know")).toEqual({ kind: "unknown" });
    expect(parseAnswer("no idea")).toEqual({ kind: "unknown" });
    expect(parseAnswer("idk")).toEqual({ kind: "unknown" });
  });

  it("detects ambiguous alternatives", () => {
    expect(parseAnswer("10 or 20")).toEqual({ kind: "ambiguous" });
    expect(parseAnswer("fifteen or sixteen")).toEqual({ kind: "ambiguous" });
  });

  it("returns unparsed for empty or nonsense", () => {
    expect(parseAnswer("")).toEqual({ kind: "unparsed" });
    expect(parseAnswer("banana")).toEqual({ kind: "unparsed" });
  });

  it("never turns the spoken question into an answer", () => {
    // Previously "seven plus eight" parsed as 15 (the correct answer) and
    // "7 + 8" as 8, so an echo of the prompt or thinking aloud got submitted.
    expect(parseAnswer("seven plus eight")).toEqual({ kind: "unparsed" });
    expect(parseAnswer("7 + 8")).toEqual({ kind: "unparsed" });
    expect(parseAnswer("seven and eight")).toEqual({ kind: "unparsed" });
    expect(parseAnswer("21 + 34 + 12")).toEqual({ kind: "unparsed" });
  });

  it("takes the answer after thinking aloud", () => {
    expect(parseAnswer("7 + 8 = 15")).toEqual({ kind: "answer", value: 15 });
    expect(parseAnswer("seven plus eight fifteen")).toEqual({ kind: "answer", value: 15 });
    expect(parseAnswer("Um, I think it's 14.")).toEqual({ kind: "answer", value: 14 });
  });

  it("treats back-to-back numbers as a correction, not a sum", () => {
    expect(parseAnswer("eight fifteen")).toEqual({ kind: "answer", value: 15 });
    expect(parseAnswer("15 16")).toEqual({ kind: "answer", value: 16 });
    expect(parseAnswer("fifty 60")).toEqual({ kind: "answer", value: 60 });
    expect(parseAnswer("100 200")).toEqual({ kind: "answer", value: 200 });
    expect(parseAnswer("fifteen, not sixteen")).toEqual({ kind: "answer", value: 15 });
    expect(parseAnswer("Oops, 60.")).toEqual({ kind: "answer", value: 60 });
  });

  it("resolves alternatives when a final choice follows", () => {
    expect(parseAnswer("fifteen or sixteen, sixteen")).toEqual({ kind: "answer", value: 16 });
  });

  it("maps lone homophones from speech-to-text", () => {
    expect(parseAnswer("for")).toEqual({ kind: "answer", value: 4 });
    expect(parseAnswer("to")).toEqual({ kind: "answer", value: 2 });
  });

  it("recognises skips phrased naturally", () => {
    expect(parseAnswer("next one")).toEqual({ kind: "skip" });
    expect(parseAnswer("can we skip this")).toEqual({ kind: "skip" });
    expect(parseAnswer("fifteen, no, skip")).toEqual({ kind: "skip" });
  });

  it("prefers a spoken number over uncertainty", () => {
    expect(parseAnswer("I don't know, maybe 15")).toEqual({ kind: "answer", value: 15 });
  });
});

describe("endsMidAnswer", () => {
  it("flags numbers that can still grow", () => {
    expect(endsMidAnswer("twenty")).toBe(true);
    expect(endsMidAnswer("20")).toBe(true);
    expect(endsMidAnswer("one hundred")).toBe(true);
    expect(endsMidAnswer("120")).toBe(true);
    expect(endsMidAnswer("one hundred and")).toBe(true);
  });

  it("flags words after the number, where a correction may follow", () => {
    expect(endsMidAnswer("fifty, oops")).toBe(true);
    // Speech-to-text misheard "oops" here; the trailing word still signals more is coming.
    expect(endsMidAnswer("fifty boops")).toBe(true);
    expect(endsMidAnswer("fifteen is")).toBe(true);
  });

  it("has nothing to wait for without an answer", () => {
    expect(endsMidAnswer("seven plus eight is")).toBe(false);
    expect(endsMidAnswer("")).toBe(false);
  });

  it("treats finished numbers as complete", () => {
    expect(endsMidAnswer("twenty one")).toBe(false);
    expect(endsMidAnswer("21")).toBe(false);
    expect(endsMidAnswer("ten")).toBe(false);
    expect(endsMidAnswer("110")).toBe(false);
    expect(endsMidAnswer("Fifteen.")).toBe(false);
    expect(endsMidAnswer("skip")).toBe(false);
  });
});
