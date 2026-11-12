import { describe, expect, it } from "vitest";

import { interpretUtterance } from "./interpret-answer";

describe("interpretUtterance", () => {
  it("submits a complete answer straight away", () => {
    expect(interpretUtterance("16")).toEqual({
      action: "submit",
      result: { kind: "answer", value: 16 },
    });
    expect(interpretUtterance("fifteen")).toEqual({
      action: "submit",
      result: { kind: "answer", value: 15 },
    });
    expect(interpretUtterance("Twenty-one.")).toEqual({
      action: "submit",
      result: { kind: "answer", value: 21 },
    });
    expect(interpretUtterance("50 oops 60 no wait 63")).toEqual({
      action: "submit",
      result: { kind: "answer", value: 63 },
    });
  });

  it("submits skips", () => {
    expect(interpretUtterance("Skip.")).toEqual({ action: "submit", result: { kind: "skip" } });
  });

  it("waits when the number may still be going", () => {
    expect(interpretUtterance("twenty")).toEqual({ action: "wait", value: 20 });
    expect(interpretUtterance("one hundred")).toEqual({ action: "wait", value: 100 });
    expect(interpretUtterance("fifty, oops")).toEqual({ action: "wait", value: 50 });
  });

  it("asks again for unknown or ambiguous replies", () => {
    expect(interpretUtterance("I don't know")).toEqual({ action: "reprompt", reason: "unknown" });
    expect(interpretUtterance("15 or 16")).toEqual({ action: "reprompt", reason: "ambiguous" });
  });

  it("does nothing for filler or a repeated question", () => {
    expect(interpretUtterance("um")).toEqual({ action: "none" });
    expect(interpretUtterance("7 + 8")).toEqual({ action: "none" });
    expect(interpretUtterance("seven plus eight is")).toEqual({ action: "none" });
  });
});
