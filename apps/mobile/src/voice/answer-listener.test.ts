import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AFTER_SPEECH_WAIT_MS,
  CONTINUATION_GRACE_MS,
  createAnswerListener,
  MAX_PENDING_MS,
  SPEECH_IN_PROGRESS_WAIT_MS,
  type AnswerListenerHandlers,
} from "./answer-listener";
import type { EndpointEvent, Endpointer } from "./endpointer";
import type { Transcriber, TranscriberHandlers } from "./gemini-transcriber";

function setup() {
  let server: TranscriberHandlers | null = null;
  const transcriber = {
    sendAudio: vi.fn<Transcriber["sendAudio"]>(),
    flush: vi.fn<Transcriber["flush"]>(),
    close: vi.fn<Transcriber["close"]>(),
  };
  const nextVadEvents: EndpointEvent[][] = [];
  const endpointer: Endpointer = { push: () => nextVadEvents.shift() ?? [] };
  const handlers = {
    onTranscript: vi.fn<AnswerListenerHandlers["onTranscript"]>(),
    onReprompt: vi.fn<AnswerListenerHandlers["onReprompt"]>(),
    onSubmit: vi.fn<AnswerListenerHandlers["onSubmit"]>(),
    onError: vi.fn<AnswerListenerHandlers["onError"]>(),
  };
  const listener = createAnswerListener(
    (h) => {
      server = h;
      return transcriber;
    },
    handlers,
    endpointer,
  );
  const audio = new ArrayBuffer(3200);
  return {
    listener,
    handlers,
    transcriber,
    server: () => server!,
    /** Push one mic buffer, with the endpointer reporting `events` for it. */
    mic: (...events: EndpointEvent[]) => {
      nextVadEvents.push(events);
      listener.pushAudio(audio, 16000);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAnswerListener", () => {
  it("streams mic audio and submits as soon as a complete answer is transcribed", () => {
    const t = setup();
    t.mic();
    expect(t.transcriber.sendAudio).toHaveBeenCalledTimes(1);
    t.server().onInterim?.("15");
    expect(t.handlers.onTranscript).toHaveBeenLastCalledWith("15");
    t.server().onFinal("fifteen");
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 15 });
    expect(t.transcriber.close).toHaveBeenCalled();
  });

  it("flushes the transcriber the moment the speaker goes quiet", () => {
    const t = setup();
    t.mic("speech_start");
    t.mic("speech_end");
    expect(t.transcriber.flush).toHaveBeenCalledTimes(1);
  });

  it("never submits without a transcript, however long it listens", () => {
    const t = setup();
    t.mic("speech_start");
    t.mic("speech_end");
    vi.advanceTimersByTime(60_000);
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
  });

  it("ignores the question being repeated and waits for the actual answer", () => {
    const t = setup();
    t.server().onFinal("7 + 8");
    vi.advanceTimersByTime(5000);
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    t.server().onFinal("15");
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 15 });
  });

  it("joins an answer that was split by a pause", () => {
    const t = setup();
    t.server().onFinal("twenty");
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    t.mic("speech_start");
    vi.advanceTimersByTime(CONTINUATION_GRACE_MS);
    t.mic("speech_end");
    t.server().onFinal("one");
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 21 });
    expect(t.handlers.onTranscript).toHaveBeenLastCalledWith("twenty one");
  });

  it("submits a round number once nothing follows it", () => {
    const t = setup();
    t.server().onFinal("forty");
    vi.advanceTimersByTime(CONTINUATION_GRACE_MS - 1);
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 40 });
  });

  it("falls back to the pending number if resumed speech produces no transcript", () => {
    const t = setup();
    t.server().onFinal("one hundred");
    t.mic("speech_start");
    t.mic("speech_end");
    vi.advanceTimersByTime(AFTER_SPEECH_WAIT_MS);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 100 });
  });

  it("applies a correction spoken after a pause", () => {
    const t = setup();
    t.server().onFinal("fifty");
    t.server().onSpeechStart?.();
    t.server().onFinal("Oops, 60.");
    vi.advanceTimersByTime(CONTINUATION_GRACE_MS);
    expect(t.handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 60 });
  });

  it("holds a finished answer while the speaker is already correcting it", () => {
    const t = setup();
    t.mic("speech_start");
    t.mic("speech_end");
    t.mic("speech_start"); // "no, sixteen" begins before "fifteen" is transcribed
    t.server().onFinal("fifteen");
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    t.mic("speech_end");
    t.server().onFinal("no, sixteen");
    expect(t.handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 16 });
  });

  it("submits the held answer if the new sound had no words", () => {
    const t = setup();
    t.mic("speech_start"); // a cough right as the answer is finalized
    t.server().onFinal("fifteen");
    vi.advanceTimersByTime(SPEECH_IN_PROGRESS_WAIT_MS - 1);
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 15 });
  });

  it("does not let ongoing noise postpone a pending answer forever", () => {
    const t = setup();
    t.server().onFinal("twenty");
    for (let elapsed = 0; elapsed < MAX_PENDING_MS - 500; elapsed += 500) {
      t.mic("speech_start");
      vi.advanceTimersByTime(250);
      t.mic("speech_end");
      vi.advanceTimersByTime(250);
    }
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    t.mic("speech_start");
    vi.advanceTimersByTime(500);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 20 });
  });

  it("settles on the live hypothesis if the final text is late", () => {
    const t = setup();
    t.server().onFinal("15. No.");
    t.server().onSpeechStart?.();
    t.server().onInterim?.("16");
    vi.advanceTimersByTime(MAX_PENDING_MS);
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 16 });
  });

  it("asks again for an ambiguous reply and then accepts a clear one", () => {
    const t = setup();
    t.server().onFinal("15 or 16");
    expect(t.handlers.onReprompt).toHaveBeenCalledWith("ambiguous");
    t.server().onFinal("16");
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 16 });
  });

  it("does not let 'I don't know' swallow the next answer", () => {
    const t = setup();
    t.server().onFinal("I don't know");
    expect(t.handlers.onReprompt).toHaveBeenCalledWith("unknown");
    t.server().onFinal("twelve");
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "answer", value: 12 });
  });

  it("submits a spoken skip", () => {
    const t = setup();
    t.server().onFinal("Skip.");
    expect(t.handlers.onSubmit).toHaveBeenCalledWith({ kind: "skip" });
  });

  it("reports connection errors once and then goes quiet", () => {
    const t = setup();
    t.server().onError("Lost connection to Gemini");
    t.server().onFinal("15");
    t.mic();
    expect(t.handlers.onError).toHaveBeenCalledTimes(1);
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    expect(t.transcriber.sendAudio).not.toHaveBeenCalled();
  });

  it("drops everything after dispose", () => {
    const t = setup();
    t.server().onFinal("twenty");
    t.listener.dispose();
    vi.advanceTimersByTime(10_000);
    t.server().onFinal("15");
    expect(t.handlers.onSubmit).not.toHaveBeenCalled();
    expect(t.transcriber.close).toHaveBeenCalled();
  });
});
