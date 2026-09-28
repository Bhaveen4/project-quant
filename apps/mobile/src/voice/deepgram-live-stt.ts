export type DeepgramTranscriptHandler = (args: {
  transcript: string;
  isFinal: boolean;
}) => void;

export type DeepgramSpeechStartedHandler = () => void;

export type DeepgramLiveSession = {
  start: () => Promise<void>;
  sendAudio: (pcm: ArrayBuffer) => void;
  stop: () => void;
};

type DeepgramResultsMessage = {
  type?: string;
  channel?: { alternatives?: { transcript?: string }[] };
  is_final?: boolean;
  speech_final?: boolean;
};

const DEFAULT_SAMPLE_RATE = 16000;

function buildListenUrl(sampleRate: number): string {
  const params = new URLSearchParams({
    model: "nova-3",
    encoding: "linear16",
    sample_rate: String(sampleRate),
    channels: "1",
    interim_results: "true",
    endpointing: "300",
    smart_format: "true",
    vad_events: "true",
    punctuate: "true",
    language: "en-US",
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export function createDeepgramLiveSession(args: {
  apiKey: string;
  sampleRate?: number;
  onTranscript: DeepgramTranscriptHandler;
  onSpeechStarted?: DeepgramSpeechStartedHandler;
  onError?: (message: string) => void;
}): DeepgramLiveSession {
  const sampleRate = args.sampleRate ?? DEFAULT_SAMPLE_RATE;
  let ws: WebSocket | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  const clearKeepAlive = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  };

  const handleMessage = (raw: string) => {
    try {
      const data = JSON.parse(raw) as DeepgramResultsMessage;
      if (data.type === "SpeechStarted") {
        args.onSpeechStarted?.();
        return;
      }
      if (data.type !== "Results") {
        return;
      }
      const transcript =
        data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (!transcript) {
        return;
      }
      args.onTranscript({
        transcript,
        isFinal: Boolean(data.is_final || data.speech_final),
      });
    } catch {
      // Ignore malformed frames.
    }
  };

  return {
    async start() {
      if (ws) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(buildListenUrl(sampleRate), [
          "token",
          args.apiKey,
        ]);
        ws = socket;

        socket.onopen = () => {
          keepAliveTimer = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "KeepAlive" }));
            }
          }, 8000);
          resolve();
        };

        socket.onerror = () => {
          args.onError?.("Deepgram connection error");
          reject(new Error("Deepgram connection error"));
        };

        socket.onmessage = (event) => {
          if (typeof event.data === "string") {
            handleMessage(event.data);
          }
        };

        socket.onclose = () => {
          clearKeepAlive();
          ws = null;
        };
      });
    },

    sendAudio(pcm: ArrayBuffer) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(pcm);
    },

    stop() {
      clearKeepAlive();
      if (!ws) {
        return;
      }
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        }
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    },
  };
}
