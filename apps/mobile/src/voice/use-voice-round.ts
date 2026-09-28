import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  RecognizerIntentExtraLanguageModel,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  interpretAnswerDeterministic,
  isConfidentInterim,
  needsLlmFallback,
} from "@/engine/interpret-answer";
import type { ParseResult } from "@/engine/parse-answer";

import { createDeepgramLiveSession } from "./deepgram-live-stt";
import { createMicPcmStream } from "./deepgram-mic";
import { interpretAnswerWithLlm } from "./llm-intent";
import { getDeepgramApiKey, getOpenAiApiKey } from "./voice-config";

export type VoicePhase =
  | "asking"
  | "listening"
  | "processing"
  | "prompt_again"
  | "denied"
  | "unavailable";

type UseVoiceRoundArgs = {
  questionId: string;
  promptSpoken: string;
  locked: boolean;
  onAnswer: (value: number) => void;
  onSkip: () => void;
  onListeningStart: () => void;
};

type UseVoiceRoundResult = {
  phase: VoicePhase;
  transcript: string;
  statusText: string;
  listenAgain: () => void;
  stopAll: () => void;
};

const SETTLE_MS = 450;

function stopDeviceRecognition() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // ignore
  }
}

function buildDeviceStartOptions() {
  return {
    lang: "en-US",
    interimResults: true,
    continuous: true,
    requiresOnDeviceRecognition: false,
    iosTaskHint: "confirmation" as const,
    iosVoiceProcessingEnabled: Platform.OS === "ios",
    contextualStrings: ["skip", "next", "pass", "sorry"],
    ...(Platform.OS === "android"
      ? {
          androidIntentOptions: {
            EXTRA_LANGUAGE_MODEL:
              RecognizerIntentExtraLanguageModel.LANGUAGE_MODEL_WEB_SEARCH,
          },
        }
      : {}),
  };
}

export function useVoiceRound({
  promptSpoken,
  locked,
  onAnswer,
  onSkip,
  onListeningStart,
}: UseVoiceRoundArgs): UseVoiceRoundResult {
  const [phase, setPhase] = useState<VoicePhase>("asking");
  const [transcript, setTranscript] = useState("");
  const [statusText, setStatusText] = useState("Speaking…");

  const activeRef = useRef(true);
  const lockedRef = useRef(locked);
  const finalizedRef = useRef(false);
  const fullTranscriptRef = useRef("");
  const finalizedSpeechRef = useRef("");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningMarkedRef = useRef(false);
  const deepgramKey = getDeepgramApiKey();
  const useDeepgram = deepgramKey != null;

  const onAnswerRef = useRef(onAnswer);
  const onSkipRef = useRef(onSkip);
  const onListeningStartRef = useRef(onListeningStart);

  const deepgramSessionRef = useRef<ReturnType<typeof createDeepgramLiveSession> | null>(
    null,
  );
  const micStreamRef = useRef<ReturnType<typeof createMicPcmStream> | null>(null);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    onAnswerRef.current = onAnswer;
  }, [onAnswer]);

  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  useEffect(() => {
    onListeningStartRef.current = onListeningStart;
  }, [onListeningStart]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const clearSettleTimer = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const markListening = useCallback(() => {
    if (!listeningMarkedRef.current) {
      listeningMarkedRef.current = true;
      onListeningStartRef.current();
    }
    setPhase("listening");
    setStatusText("Speak anytime…");
  }, []);

  const bargeInStopTts = useCallback(() => {
    Speech.stop();
  }, []);

  const stopStreams = useCallback(() => {
    clearSettleTimer();
    micStreamRef.current?.stop();
    micStreamRef.current = null;
    deepgramSessionRef.current?.stop();
    deepgramSessionRef.current = null;
    stopDeviceRecognition();
  }, [clearSettleTimer]);

  const stopAll = useCallback(() => {
    Speech.stop();
    stopStreams();
  }, [stopStreams]);

  const applyParseResult = useCallback(
    (parsed: ParseResult) => {
      if (!activeRef.current || lockedRef.current || finalizedRef.current) {
        return;
      }
      if (parsed.kind === "answer") {
        finalizedRef.current = true;
        stopStreams();
        setPhase("processing");
        setStatusText(`Heard: ${parsed.value}`);
        onAnswerRef.current(parsed.value);
        return;
      }
      if (parsed.kind === "skip") {
        finalizedRef.current = true;
        stopStreams();
        setPhase("processing");
        setStatusText("Skipped");
        onSkipRef.current();
        return;
      }
      if (parsed.kind === "unknown") {
        stopStreams();
        setPhase("prompt_again");
        setStatusText("Say a number or tap Skip");
        return;
      }
    },
    [stopStreams],
  );

  const processTranscript = useCallback(
    async (text: string, isFinal: boolean) => {
      if (!activeRef.current || lockedRef.current || finalizedRef.current) {
        return;
      }

      const piece = text.trim();
      if (!piece) {
        return;
      }

      const merged = isFinal
        ? finalizedSpeechRef.current
          ? `${finalizedSpeechRef.current} ${piece}`.trim()
          : piece
        : finalizedSpeechRef.current
          ? `${finalizedSpeechRef.current} ${piece}`.trim()
          : piece;

      if (isFinal) {
        finalizedSpeechRef.current = merged;
      }

      fullTranscriptRef.current = merged;
      setTranscript(merged);

      const interpreted = interpretAnswerDeterministic(merged);
      if (
        interpreted.confidence === "high" &&
        (interpreted.kind === "answer" || interpreted.kind === "skip")
      ) {
        applyParseResult(interpreted);
        return;
      }

      if (isFinal || isConfidentInterim(merged, interpreted)) {
        if (interpreted.kind === "answer" || interpreted.kind === "skip") {
          applyParseResult(interpreted);
          return;
        }
      }

      clearSettleTimer();
      settleTimer.current = setTimeout(() => {
        void (async () => {
          if (!activeRef.current || finalizedRef.current || lockedRef.current) {
            return;
          }
          const latest = fullTranscriptRef.current;
          const det = interpretAnswerDeterministic(latest);
          if (det.kind === "answer" || det.kind === "skip") {
            applyParseResult(det);
            return;
          }
          const openAiKey = getOpenAiApiKey();
          if (openAiKey && needsLlmFallback(latest, det)) {
            setStatusText("Thinking…");
            const llm = await interpretAnswerWithLlm(latest, openAiKey);
            if (llm.kind === "answer" || llm.kind === "skip") {
              applyParseResult(llm);
              return;
            }
          }
          stopStreams();
          setPhase("prompt_again");
          setStatusText("Tap Listen again and say your answer");
        })();
      }, SETTLE_MS);
    },
    [applyParseResult, clearSettleTimer, stopStreams],
  );

  const startDeepgramListening = useCallback(async () => {
    if (!deepgramKey) {
      return;
    }
    stopStreams();
    listeningMarkedRef.current = false;
    setPhase("listening");
    setStatusText("Connecting…");

    const session = createDeepgramLiveSession({
      apiKey: deepgramKey,
      onSpeechStarted: () => {
        bargeInStopTts();
        markListening();
      },
      onTranscript: ({ transcript: piece, isFinal }) => {
        bargeInStopTts();
        markListening();
        void processTranscript(piece, isFinal);
      },
      onError: (msg) => {
        setPhase("prompt_again");
        setStatusText(msg);
      },
    });

    const mic = createMicPcmStream((data) => {
      session.sendAudio(data);
    });

    deepgramSessionRef.current = session;
    micStreamRef.current = mic;

    try {
      await session.start();
      await mic.start();
      markListening();
    } catch {
      stopStreams();
      setPhase("unavailable");
      setStatusText(
        "Deepgram mic failed — rebuild dev APK with expo-audio or check key",
      );
    }
  }, [
    bargeInStopTts,
    deepgramKey,
    markListening,
    processTranscript,
    stopStreams,
  ]);

  const startDeviceListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setPhase("unavailable");
      setStatusText("Speech recognition not available");
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setPhase("denied");
      setStatusText("Microphone / speech permission required");
      return;
    }
    listeningMarkedRef.current = false;
    stopDeviceRecognition();
    ExpoSpeechRecognitionModule.start(buildDeviceStartOptions());
    markListening();
  }, [markListening]);

  const startListening = useCallback(async () => {
    if (lockedRef.current || finalizedRef.current) {
      return;
    }
    fullTranscriptRef.current = "";
    finalizedSpeechRef.current = "";
    setTranscript("");
    if (useDeepgram) {
      await startDeepgramListening();
    } else {
      await startDeviceListening();
    }
  }, [startDeepgramListening, startDeviceListening, useDeepgram]);

  const listenAgain = useCallback(() => {
    if (lockedRef.current || finalizedRef.current) {
      return;
    }
    Speech.stop();
    void startListening();
  }, [startListening]);

  useSpeechRecognitionEvent("result", (event) => {
    if (useDeepgram || !activeRef.current || finalizedRef.current || lockedRef.current) {
      return;
    }
    const piece = event.results[0]?.transcript?.trim() ?? "";
    if (!piece) {
      return;
    }
    bargeInStopTts();
    markListening();
    void processTranscript(piece, event.isFinal);
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (useDeepgram || finalizedRef.current || event.error === "aborted") {
      return;
    }
    if (event.error === "not-allowed") {
      setPhase("denied");
      setStatusText("Microphone / speech permission required");
    }
  });

  useEffect(() => {
    const listenTimer = setTimeout(() => {
      void startListening();
    }, 0);

    Speech.speak(promptSpoken, {
      language: "en-US",
      rate: 1.0,
      onDone: () => {
        if (!finalizedRef.current && activeRef.current) {
          setStatusText("Speak anytime…");
        }
      },
    });

    return () => {
      clearTimeout(listenTimer);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one round per mount
  }, []);

  useEffect(() => {
    if (locked) {
      stopAll();
    }
  }, [locked, stopAll]);

  return {
    phase,
    transcript,
    statusText,
    listenAgain,
    stopAll,
  };
}
