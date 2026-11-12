/**
 * Streaming speech-to-text over the Gemini Live API.
 *
 * This deliberately uses the dedicated transcription model rather than a
 * conversational Live model: a conversational model is given the question and
 * will "helpfully" solve it, submitting the correct answer the user never said.
 * Here Gemini only turns audio into text; the app decides what the answer is.
 */

const MODEL = "models/gemini-3.5-transcribe-live";
const ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const LANGUAGE_CODES = ["en-US"];
/** Short command words are the easiest to mishear in a noisy room ("skip" → "skier"). */
const CUSTOM_VOCABULARY = ["skip", "pass", "next"];
/** Server-side end-of-speech fallback; the client endpointer usually flushes sooner. */
const SERVER_SILENCE_MS = 500;
const SETUP_TIMEOUT_MS = 8000;
/** Audio captured before setup completes is held back, up to ~10 s of 100 ms chunks. */
const MAX_QUEUED_MESSAGES = 100;

export type TranscriberHandlers = {
  /** The server heard the start of speech. */
  onSpeechStart?: () => void;
  /** Live hypothesis for the segment being spoken; replaces the previous one. */
  onInterim?: (text: string) => void;
  /** Authoritative text for a finished speech segment. */
  onFinal: (text: string) => void;
  /** The connection failed or dropped. No further events follow. */
  onError: (message: string) => void;
};

export type Transcriber = {
  sendAudio: (pcm: ArrayBuffer, sampleRate: number) => void;
  /** The speaker paused: ask the server to finalize the current segment now. */
  flush: () => void;
  close: () => void;
};

export type TranscriberEvent =
  | { type: "ready" }
  | { type: "speech_start" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };

type ServerMessage = {
  setupComplete?: object;
  serverContent?: {
    inputTranscription?: { text?: string };
    interimInputTranscription?: { text?: string };
  };
  voiceActivity?: { type?: string };
  error?: { message?: string };
};

export function buildSetupMessage() {
  return {
    setup: {
      model: MODEL,
      generationConfig: { responseModalities: ["TEXT"] },
      inputAudioTranscription: {
        languageCodes: LANGUAGE_CODES,
        customVocabulary: CUSTOM_VOCABULARY,
      },
      realtimeInputConfig: {
        automaticActivityDetection: { silenceDurationMs: SERVER_SILENCE_MS },
      },
    },
  };
}

export function parseServerMessage(raw: string): TranscriberEvent[] {
  let data: ServerMessage;
  try {
    data = JSON.parse(raw) as ServerMessage;
  } catch {
    return [];
  }
  if (data == null || typeof data !== "object") {
    return [];
  }

  const events: TranscriberEvent[] = [];
  if (data.error) {
    events.push({ type: "error", message: data.error.message || "Gemini returned an error" });
    return events;
  }
  if (data.setupComplete) {
    events.push({ type: "ready" });
  }
  if (data.voiceActivity?.type === "ACTIVITY_START") {
    events.push({ type: "speech_start" });
  }
  const interim = data.serverContent?.interimInputTranscription?.text?.trim();
  if (interim) {
    events.push({ type: "interim", text: interim });
  }
  const final = data.serverContent?.inputTranscription?.text?.trim();
  if (final) {
    events.push({ type: "final", text: final });
  }
  return events;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64[n >> 18] + BASE64[(n >> 12) & 63] + BASE64[(n >> 6) & 63] + BASE64[n & 63];
  }
  if (i < bytes.length) {
    const hasSecond = i + 1 < bytes.length;
    const n = (bytes[i] << 16) | (hasSecond ? bytes[i + 1] << 8 : 0);
    out += BASE64[n >> 18] + BASE64[(n >> 12) & 63];
    out += hasSecond ? BASE64[(n >> 6) & 63] + "=" : "==";
  }
  return out;
}

function frameToText(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  return null;
}

/** Opens a transcription session immediately; audio sent before it is ready is queued. */
export function openGeminiTranscriber(
  apiKey: string,
  handlers: TranscriberHandlers,
): Transcriber {
  let closed = false;
  let ready = false;
  let setupTimer: ReturnType<typeof setTimeout> | undefined;
  const queued: string[] = [];

  const socket = new WebSocket(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`);
  socket.binaryType = "arraybuffer";

  const send = (message: string) => {
    if (!ready) {
      queued.push(message);
      if (queued.length > MAX_QUEUED_MESSAGES) {
        queued.shift();
      }
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(message);
      } catch {
        // The close handler reports the failure.
      }
    }
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(setupTimer);
    queued.length = 0;
    try {
      socket.close();
    } catch {
      // ignore
    }
  };

  const fail = (message: string) => {
    if (closed) {
      return;
    }
    close();
    handlers.onError(message);
  };

  setupTimer = setTimeout(() => {
    fail("Timed out connecting to Gemini — check your network");
  }, SETUP_TIMEOUT_MS);

  socket.onopen = () => {
    if (!closed) {
      socket.send(JSON.stringify(buildSetupMessage()));
    }
  };

  socket.onmessage = (event: { data?: unknown }) => {
    const text = frameToText(event.data);
    if (closed || text == null) {
      return;
    }
    for (const parsed of parseServerMessage(text)) {
      if (closed) {
        return;
      }
      switch (parsed.type) {
        case "ready":
          ready = true;
          clearTimeout(setupTimer);
          for (const message of queued.splice(0)) {
            send(message);
          }
          break;
        case "speech_start":
          handlers.onSpeechStart?.();
          break;
        case "interim":
          handlers.onInterim?.(parsed.text);
          break;
        case "final":
          handlers.onFinal(parsed.text);
          break;
        case "error":
          fail(parsed.message);
          return;
      }
    }
  };

  socket.onerror = () => {
    // React Native and browsers follow up with onclose, which carries the reason.
  };

  socket.onclose = (event: { reason?: string }) => {
    const reason = event.reason?.trim();
    fail(
      reason ||
        (ready ? "Lost connection to Gemini" : "Could not connect to Gemini — check the API key"),
    );
  };

  return {
    sendAudio(pcm, sampleRate) {
      if (closed) {
        return;
      }
      send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: bytesToBase64(new Uint8Array(pcm)),
              mimeType: `audio/pcm;rate=${sampleRate}`,
            },
          },
        }),
      );
    },
    flush() {
      if (!closed) {
        send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      }
    },
    close,
  };
}
