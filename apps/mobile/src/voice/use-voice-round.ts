import { requestRecordingPermissionsAsync, useAudioStream, type AudioStreamBuffer } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";

import { createAnswerListener, type AnswerListener } from "./answer-listener";
import { openGeminiTranscriber } from "./gemini-transcriber";
import { getGeminiApiKey } from "./voice-config";

const MISSING_KEY_MESSAGE = "Set EXPO_PUBLIC_GEMINI_API_KEY in .env";
const SAMPLE_RATE = 16000;

/**
 * Upper bound for reading a prompt aloud. If the speech engine never reports
 * that it finished, the mic opens after this instead of the round hanging.
 */
function promptTimeoutMs(spoken: string): number {
  return spoken.split(/[\s-]+/).length * 600 + 4000;
}

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

type RoundState = {
  key: string;
  phase: VoicePhase;
  transcript: string;
  statusText: string;
};

function freshRound(key: string, hasApiKey: boolean): RoundState {
  return hasApiKey
    ? { key, phase: "asking", transcript: "", statusText: "Speaking…" }
    : { key, phase: "unavailable", transcript: "", statusText: MISSING_KEY_MESSAGE };
}

/**
 * Runs one spoken question: read it aloud, then listen for the answer.
 *
 * The microphone only opens after the prompt has finished, so the app never
 * transcribes its own voice. Every round (each question, and each "Listen
 * again") gets a fresh transcription session, so speech from an earlier round
 * can never be attributed to the current one.
 */
export function useVoiceRound({
  questionId,
  promptSpoken,
  locked,
  onAnswer,
  onSkip,
  onListeningStart,
}: UseVoiceRoundArgs): UseVoiceRoundResult {
  const apiKey = getGeminiApiKey();
  const [attempt, setAttempt] = useState(0);
  const roundKey = `${questionId}#${attempt}`;

  // Reset during render when the round changes (new question or Listen again).
  const [round, setRound] = useState(() => freshRound(roundKey, apiKey != null));
  if (round.key !== roundKey) {
    setRound(freshRound(roundKey, apiKey != null));
  }

  const onAnswerRef = useRef(onAnswer);
  const onSkipRef = useRef(onSkip);
  const onListeningStartRef = useRef(onListeningStart);
  const audioSinkRef = useRef<((buffer: AudioStreamBuffer) => void) | null>(null);
  /** Key of the round currently using the microphone. */
  const micOwnerRef = useRef<string | null>(null);
  const micPermittedRef = useRef(false);
  const endRoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onAnswerRef.current = onAnswer;
  }, [onAnswer]);

  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  useEffect(() => {
    onListeningStartRef.current = onListeningStart;
  }, [onListeningStart]);

  const { stream } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    encoding: "int16",
    onBuffer: (buffer) => audioSinkRef.current?.(buffer),
  });


  useEffect(() => {
    if (!apiKey || locked) {
      return;
    }

    const key = roundKey;
    let ended = false;
    let failed = false;
    let listeningRequested = false;
    let listener: AnswerListener | null = null;

    const update = (patch: Partial<Omit<RoundState, "key">>) => {
      if (!ended) {
        setRound((prev) => (prev.key === key ? { ...prev, ...patch } : prev));
      }
    };

    const stopStream = () => {
      try {
        stream.stop();
      } catch {
        // Already released on unmount.
      }
    };

    const releaseMic = () => {
      if (micOwnerRef.current === key) {
        micOwnerRef.current = null;
        audioSinkRef.current = null;
        stopStream();
      }
    };

    const fail = (phase: VoicePhase, message: string) => {
      failed = true;
      releaseMic();
      listener?.dispose();
      update({ phase, statusText: message });
    };

    const roundListener = createAnswerListener(
      (handlers) => openGeminiTranscriber(apiKey, handlers),
      {
        onTranscript: (text) => update({ transcript: text }),
        onReprompt: (reason) =>
          update({
            phase: "prompt_again",
            statusText: reason === "ambiguous" ? "Say just one number" : "Say a number, or say “skip”",
          }),
        onSubmit: (result) => {
          if (ended) {
            return;
          }
          releaseMic();
          if (result.kind === "answer") {
            update({ phase: "processing", transcript: String(result.value), statusText: "Got it" });
            onAnswerRef.current(result.value);
          } else {
            update({ phase: "processing", statusText: "Skipped" });
            onSkipRef.current();
          }
        },
        onError: (message) => {
          if (!ended) {
            fail("unavailable", message);
          }
        },
      },
    );
    listener = roundListener;

    let promptTimer: ReturnType<typeof setTimeout> | undefined;

    const startListening = async () => {
      clearTimeout(promptTimer);
      if (ended || failed || listeningRequested) {
        return;
      }
      listeningRequested = true;
      if (!micPermittedRef.current) {
        const permission = await requestRecordingPermissionsAsync().catch(() => null);
        if (ended || failed) {
          return;
        }
        if (!permission?.granted) {
          fail("denied", "Microphone permission required");
          return;
        }
        micPermittedRef.current = true;
      }

      micOwnerRef.current = key;
      audioSinkRef.current = (buffer) => roundListener.pushAudio(buffer.data, buffer.sampleRate);
      try {
        await stream.start();
      } catch (error) {
        if (micOwnerRef.current === key) {
          micOwnerRef.current = null;
          audioSinkRef.current = null;
        }
        // Permission may have been revoked in Settings; ask again next time.
        micPermittedRef.current = false;
        if (!ended) {
          fail("unavailable", error instanceof Error ? error.message : "Microphone unavailable");
        }
        return;
      }

      if (ended || failed) {
        // The round ended while the mic was starting; stop it unless a newer round took it over.
        if (micOwnerRef.current === null || micOwnerRef.current === key) {
          micOwnerRef.current = null;
          audioSinkRef.current = null;
          stopStream();
        }
        return;
      }
      update({ phase: "listening", statusText: "Listening…" });
      onListeningStartRef.current();
    };

    promptTimer = setTimeout(() => void startListening(), promptTimeoutMs(promptSpoken));
    Speech.stop();
    Speech.speak(promptSpoken, {
      language: "en-US",
      rate: 1.0,
      // iOS: speak through the system's own session; the mic stream switches the
      // app session to record-only, which would otherwise silence later prompts.
      useApplicationAudioSession: false,
      onDone: () => void startListening(),
      onError: () => void startListening(),
    });

    const end = () => {
      if (ended) {
        return;
      }
      ended = true;
      clearTimeout(promptTimer);
      Speech.stop();
      releaseMic();
      roundListener.dispose();
    };
    endRoundRef.current = end;
    return end;
  }, [apiKey, locked, roundKey, promptSpoken, stream]);

  const listenAgain = useCallback(() => {
    if (!locked) {
      setAttempt((n) => n + 1);
    }
  }, [locked]);

  const stopAll = useCallback(() => {
    endRoundRef.current?.();
    Speech.stop();
  }, []);

  return {
    phase: round.phase,
    transcript: round.transcript,
    statusText: round.statusText,
    listenAgain,
    stopAll,
  };
}
