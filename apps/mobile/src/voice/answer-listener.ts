import { interpretUtterance, type SubmittedAnswer } from "@/engine/interpret-answer";

import { createEndpointer, type Endpointer } from "./endpointer";
import type { Transcriber, TranscriberHandlers } from "./gemini-transcriber";

// While an answer is pending (it might still change), these decide how long to
// wait for more speech before submitting it.

/**
 * After a number that may continue ("twenty…", "fifty, oops…"). Long enough for
 * the server to notice resumed speech even in a noisy room (~650 ms observed).
 */
export const CONTINUATION_GRACE_MS = 1000;
/**
 * A complete answer arrived while the user was already talking again
 * ("fifteen … no, sixteen"): hold it briefly so the correction can land.
 */
export const SPEECH_IN_PROGRESS_WAIT_MS = 1000;
/** Voice activity but no words yet: time for real speech to produce a transcript. */
export const VOICE_ACTIVITY_WAIT_MS = 1500;
/** New words are being transcribed: wait for their final text. */
export const WORDS_IN_PROGRESS_WAIT_MS = 2500;
/** The user went quiet and the transcriber was flushed: final text arrives well within this. */
export const AFTER_SPEECH_WAIT_MS = 1000;
/** Noise or chatter must not postpone an answer forever: cap after the last transcript. */
export const MAX_PENDING_MS = 4000;

export type AnswerListenerHandlers = {
  /** Everything heard so far this round, including the live hypothesis. */
  onTranscript: (text: string) => void;
  onReprompt: (reason: "unknown" | "ambiguous") => void;
  /** Called at most once; the listener is finished afterwards. */
  onSubmit: (result: SubmittedAnswer) => void;
  /** Called at most once; the listener is finished afterwards. */
  onError: (message: string) => void;
};

export type AnswerListener = {
  /** Feed microphone audio (int16 mono PCM). */
  pushAudio: (pcm: ArrayBuffer, sampleRate: number) => void;
  dispose: () => void;
};

/**
 * Listens for the answer to one question. Each question gets its own
 * transcriber, so nothing said for a previous question can leak into this one.
 */
export function createAnswerListener(
  openTranscriber: (handlers: TranscriberHandlers) => Transcriber,
  handlers: AnswerListenerHandlers,
  endpointer: Endpointer = createEndpointer(),
): AnswerListener {
  let done = false;
  let heard = "";
  let live = "";
  let pendingValue: number | null = null;
  let pendingDeadline = 0;
  /** The on-device endpointer currently hears the user talking. */
  let speaking = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let transcriber: Transcriber | undefined;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const finish = () => {
    done = true;
    clearTimer();
    transcriber?.close();
  };

  const submit = (result: SubmittedAnswer) => {
    if (done) {
      return;
    }
    finish();
    handlers.onSubmit(result);
  };

  /** Out of time: settle on the best evidence available. */
  const submitPending = () => {
    if (pendingValue === null) {
      return;
    }
    // The final text for the latest words may still be in flight; their live
    // hypothesis ("15. No." + "16") beats the number pending from before them.
    if (live) {
      const decision = interpretUtterance(`${heard} ${live}`);
      if (decision.action === "submit") {
        submit(decision.result);
        return;
      }
      if (decision.action === "wait") {
        submit({ kind: "answer", value: decision.value });
        return;
      }
    }
    submit({ kind: "answer", value: pendingValue });
  };

  const waitForMore = (ms: number) => {
    clearTimer();
    const delay = Math.max(0, Math.min(ms, pendingDeadline - Date.now()));
    timer = setTimeout(() => {
      timer = null;
      submitPending();
    }, delay);
  };

  /** Remember `value` as the answer unless more speech changes it within `ms`. */
  const hold = (value: number, ms: number) => {
    pendingValue = value;
    pendingDeadline = Date.now() + MAX_PENDING_MS;
    waitForMore(ms);
  };

  /** More may be coming: push back the submission of a pending answer. */
  const extendWait = (ms: number) => {
    if (!done && pendingValue !== null) {
      waitForMore(ms);
    }
  };

  const emitTranscript = () => {
    handlers.onTranscript([heard, live].filter(Boolean).join(" "));
  };

  const decide = () => {
    const decision = interpretUtterance(heard);
    switch (decision.action) {
      case "submit":
        if (decision.result.kind === "answer" && speaking) {
          hold(decision.result.value, SPEECH_IN_PROGRESS_WAIT_MS);
          return;
        }
        submit(decision.result);
        return;
      case "wait":
        hold(decision.value, CONTINUATION_GRACE_MS);
        return;
      case "reprompt":
        heard = "";
        pendingValue = null;
        clearTimer();
        handlers.onReprompt(decision.reason);
        return;
      case "none":
        // Keep what was heard: "I think it's" may be completed by "fifteen".
        pendingValue = null;
        clearTimer();
        return;
    }
  };

  transcriber = openTranscriber({
    onSpeechStart: () => extendWait(VOICE_ACTIVITY_WAIT_MS),
    onInterim: (text) => {
      if (done) {
        return;
      }
      live = text;
      emitTranscript();
      extendWait(WORDS_IN_PROGRESS_WAIT_MS);
    },
    onFinal: (text) => {
      if (done) {
        return;
      }
      live = "";
      heard = heard ? `${heard} ${text}` : text;
      emitTranscript();
      decide();
    },
    onError: (message) => {
      if (done) {
        return;
      }
      finish();
      handlers.onError(message);
    },
  });
  const activeTranscriber = transcriber;
  if (done) {
    activeTranscriber.close();
  }

  return {
    pushAudio(pcm, sampleRate) {
      if (done) {
        return;
      }
      activeTranscriber.sendAudio(pcm, sampleRate);
      for (const event of endpointer.push(pcm, sampleRate)) {
        if (done) {
          return;
        }
        if (event === "speech_start") {
          speaking = true;
          extendWait(VOICE_ACTIVITY_WAIT_MS);
        } else {
          speaking = false;
          activeTranscriber.flush();
          extendWait(AFTER_SPEECH_WAIT_MS);
        }
      }
    },
    dispose() {
      if (!done) {
        finish();
      }
    },
  };
}
