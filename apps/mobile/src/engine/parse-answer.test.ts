import { describe, expect, it } from "vitest";

import { parseAnswer, parseNumberPhrase } from "./parse-answer";

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
});
