import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { parseAnswer } from "@/engine";

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

function stopRecognition() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Native module may throw if already idle.
  }
}

/**
 * One instance per question — parent remounts with key={question.id}.
 */
export function useVoiceRound({
  questionId,
  promptSpoken,
  locked,
  onAnswer,
  onSkip,
  onListeningStart,
}: UseVoiceRoundArgs): UseVoiceRoundResult {
  const [phase, setPhase] = useState<VoicePhase>("asking");
  const [transcript, setTranscript] = useState("");
  const [statusText, setStatusText] = useState("Speaking…");

  const questionIdRef = useRef(questionId);
  const lockedRef = useRef(locked);
  const finalizedRef = useRef(false);
  const segmentBuf = useRef("");
  const listeningStartedRef = useRef(false);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAnswerRef = useRef(onAnswer);
  const onSkipRef = useRef(onSkip);
  const onListeningStartRef = useRef(onListeningStart);

  useEffect(() => {
    questionIdRef.current = questionId;
  }, [questionId]);

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

  const clearPromptTimer = useCallback(() => {
    if (promptTimer.current) {
      clearTimeout(promptTimer.current);
      promptTimer.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    clearPromptTimer();
    Speech.stop();
    stopRecognition();
  }, [clearPromptTimer]);

  const handleParsed = useCallback(
    (raw: string) => {
      if (lockedRef.current || finalizedRef.current) {
        return;
      }
      if (questionIdRef.current !== questionId) {
        return;
      }

      const parsed = parseAnswer(raw);
      if (parsed.kind === "answer") {
        finalizedRef.current = true;
        clearPromptTimer();
        stopRecognition();
        setPhase("processing");
        setStatusText(`Heard: ${parsed.value}`);
        onAnswerRef.current(parsed.value);
        return;
      }
      if (parsed.kind === "skip") {
        finalizedRef.current = true;
        clearPromptTimer();
        stopRecognition();
        setPhase("processing");
        setStatusText("Skipped");
        onSkipRef.current();
        return;
      }
      if (parsed.kind === "unknown" || parsed.kind === "ambiguous") {
        stopRecognition();
        setPhase("prompt_again");
        setStatusText(
          parsed.kind === "ambiguous"
            ? "Too many options — say one number"
            : "Say that again",
        );
        return;
      }
      stopRecognition();
      setPhase("prompt_again");
      setStatusText("Say that again");
    },
    [clearPromptTimer, questionId],
  );

  const startListening = useCallback(async () => {
    if (lockedRef.current || finalizedRef.current) {
      return;
    }
    if (questionIdRef.current !== questionId) {
      return;
    }

    clearPromptTimer();
    stopRecognition();
    segmentBuf.current = "";
    setTranscript("");

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setPhase("unavailable");
      setStatusText("Speech recognition is not available on this device");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setPhase("denied");
      setStatusText("Microphone / speech permission required");
      return;
    }

    listeningStartedRef.current = false;
    setPhase("listening");
    setStatusText("Listening…");

    const onDevice =
      Platform.OS === "ios" &&
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: onDevice,
      contextualStrings: ["skip", "next", "pass", "sorry"],
    });
  }, [clearPromptTimer, questionId]);

  const listenAgain = useCallback(() => {
    if (lockedRef.current || finalizedRef.current) {
      return;
    }
    void startListening();
  }, [startListening]);

  useSpeechRecognitionEvent("start", () => {
    if (questionIdRef.current !== questionId || finalizedRef.current) {
      return;
    }
    if (!listeningStartedRef.current) {
      listeningStartedRef.current = true;
      onListeningStartRef.current();
    }
    setPhase("listening");
    setStatusText("Listening…");
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (
      questionIdRef.current !== questionId ||
      finalizedRef.current ||
      lockedRef.current
    ) {
      return;
    }

    const piece = event.results[0]?.transcript?.trim() ?? "";
    if (!piece) {
      return;
    }

    if (event.isFinal) {
      const combined = segmentBuf.current
        ? `${segmentBuf.current} ${piece}`.trim()
        : piece;
      segmentBuf.current = combined;
      setTranscript(combined);
      handleParsed(combined);
      return;
    }

    const live = segmentBuf.current
      ? `${segmentBuf.current} ${piece}`.trim()
      : piece;
    setTranscript(live);
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (
      questionIdRef.current !== questionId ||
      finalizedRef.current ||
      lockedRef.current
    ) {
      return;
    }
    if (event.error === "aborted") {
      return;
    }
    if (event.error === "not-allowed") {
      setPhase("denied");
      setStatusText("Microphone / speech permission required");
      return;
    }
    setPhase("prompt_again");
    setStatusText("Say that again");
  });

  useSpeechRecognitionEvent("end", () => {
    if (
      questionIdRef.current !== questionId ||
      finalizedRef.current ||
      lockedRef.current
    ) {
      return;
    }
    setPhase((current) => {
      if (current === "denied" || current === "unavailable") {
        return current;
      }
      return "prompt_again";
    });
    setStatusText((current) =>
      current === "Microphone / speech permission required" ||
      current.startsWith("Speech recognition")
        ? current
        : "Say that again",
    );
    clearPromptTimer();
    promptTimer.current = setTimeout(() => {
      if (
        !finalizedRef.current &&
        !lockedRef.current &&
        questionIdRef.current === questionId
      ) {
        void startListening();
      }
    }, 700);
  });

  // Parent remounts this hook per question id — start TTS once on mount.
  useEffect(() => {
    Speech.speak(promptSpoken, {
      language: "en-US",
      rate: 1.0,
      onDone: () => {
        if (questionIdRef.current === questionId && !finalizedRef.current) {
          void startListening();
        }
      },
      onError: () => {
        if (questionIdRef.current === questionId && !finalizedRef.current) {
          setStatusText("Could not speak — listening anyway");
          void startListening();
        }
      },
    });

    return () => {
      clearPromptTimer();
      Speech.stop();
      stopRecognition();
    };
    // Intentionally once per mount (question keyed by parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remounted per question
  }, []);

  useEffect(() => {
    if (locked) {
      clearPromptTimer();
      Speech.stop();
      stopRecognition();
    }
  }, [locked, clearPromptTimer]);

  return {
    phase,
    transcript,
    statusText,
    listenAgain,
    stopAll,
  };
}
