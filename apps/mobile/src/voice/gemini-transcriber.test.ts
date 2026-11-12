import { describe, expect, it } from "vitest";

import { buildSetupMessage, bytesToBase64, parseServerMessage } from "./gemini-transcriber";

describe("buildSetupMessage", () => {
  it("asks for transcription only, with no tools and no question context", () => {
    const { setup } = buildSetupMessage();
    expect(setup.model).toBe("models/gemini-3.5-transcribe-live");
    expect(setup.generationConfig.responseModalities).toEqual(["TEXT"]);
    expect(setup).not.toHaveProperty("tools");
    expect(setup).not.toHaveProperty("systemInstruction");
  });
});

describe("parseServerMessage", () => {
  it("reads the frames the transcription model sends", () => {
    expect(parseServerMessage('{"setupComplete":{}}')).toEqual([{ type: "ready" }]);
    expect(
      parseServerMessage(
        '{"serverContent":{},"voiceActivity":{"type":"ACTIVITY_START","audioOffset":"0.44s"}}',
      ),
    ).toEqual([{ type: "speech_start" }]);
    expect(parseServerMessage('{"serverContent":{"interimInputTranscription":{"text":"21"}}}')).toEqual(
      [{ type: "interim", text: "21" }],
    );
    expect(
      parseServerMessage('{"serverContent":{"inputTranscription":{"text":" twenty-one "}}}'),
    ).toEqual([{ type: "final", text: "twenty-one" }]);
  });

  it("ignores bookkeeping frames and malformed input", () => {
    expect(parseServerMessage('{"serverContent":{"generationComplete":true}}')).toEqual([]);
    expect(
      parseServerMessage('{"serverContent":{},"voiceActivity":{"type":"ACTIVITY_END"}}'),
    ).toEqual([]);
    expect(parseServerMessage("not json")).toEqual([]);
    expect(parseServerMessage("null")).toEqual([]);
  });

  it("surfaces server errors", () => {
    expect(parseServerMessage('{"error":{"message":"API key not valid"}}')).toEqual([
      { type: "error", message: "API key not valid" },
    ]);
  });
});

describe("bytesToBase64", () => {
  it("matches the standard encoding for every padding case", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 3200]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});
