import { router, Stack } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdditionStack } from "@/components/addition-stack";
import { Keypad } from "@/components/keypad";
import {
  commitAnswer,
  currentQuestion,
  isSessionComplete,
  parseTypedAnswer,
  shouldCommitTypedAnswer,
  skipQuestion,
  type AdditionQuestion,
  type PracticeSession,
} from "@/engine";
import { usePracticeSession } from "@/session/session-context";
import { useVoiceRound } from "@/voice/use-voice-round";

const MISS_FLASH_MS = 280;

export default function PracticeScreen() {
  const { session, replace } = usePracticeSession();
  const question = session ? currentQuestion(session) : null;

  useEffect(() => {
    if (!session) {
      router.replace("/");
    }
  }, [session]);

  if (!session || !question) {
    return null;
  }

  if (session.settings.inputMode === "voice") {
    return (
      <VoicePracticeRound
        key={question.id}
        session={session}
        question={question}
        replace={replace}
      />
    );
  }

  return (
    <TypedPracticeRound
      key={question.id}
      session={session}
      question={question}
      replace={replace}
    />
  );
}

function useRoundCommit(
  session: PracticeSession,
  question: AdditionQuestion,
  replace: (next: PracticeSession) => void,
) {
  const [missFlash, setMissFlash] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  const startedAt = useRef(0);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSession = useRef<PracticeSession | null>(null);

  useEffect(() => {
    return () => {
      if (missTimer.current) {
        clearTimeout(missTimer.current);
      }
    };
  }, []);

  const markStart = () => {
    if (startedAt.current === 0) {
      startedAt.current = Date.now();
    }
  };

  const elapsed = () => {
    markStart();
    return Date.now() - startedAt.current;
  };

  const apply = (next: PracticeSession) => {
    pendingSession.current = null;
    replace(next);
    if (isSessionComplete(next)) {
      router.replace("/summary");
    }
  };

  const onCorrect = (value: number) => {
    setInputLocked(true);
    apply(commitAnswer(session, question.id, value, elapsed()));
  };

  const onWrong = (value: number) => {
    setInputLocked(true);
    setMissFlash(true);
    const next = commitAnswer(session, question.id, value, elapsed());
    pendingSession.current = next;
    missTimer.current = setTimeout(() => {
      apply(next);
    }, MISS_FLASH_MS);
  };

  const onSkip = () => {
    if (inputLocked) {
      return;
    }
    setInputLocked(true);
    apply(skipQuestion(session, question.id, elapsed()));
  };

  const onEnd = () => {
    if (missTimer.current) {
      clearTimeout(missTimer.current);
      missTimer.current = null;
    }
    if (pendingSession.current) {
      apply(pendingSession.current);
      return;
    }
    router.replace("/summary");
  };

  return {
    missFlash,
    inputLocked,
    markStart,
    onCorrect,
    onWrong,
    onSkip,
    onEnd,
  };
}

function PracticeChrome({
  session,
  onEnd,
  children,
  footer,
}: {
  session: PracticeSession;
  onEnd: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: "#0E0F11" },
          headerTintColor: "#FFFFFF",
          headerTitle: `${session.currentIndex + 1} / ${session.questions.length}`,
          headerRight: () => (
            <Pressable onPress={onEnd} hitSlop={12}>
              <Text style={styles.end}>End</Text>
            </Pressable>
          ),
        }}
      />
      {children}
      {footer}
    </SafeAreaView>
  );
}

function TypedPracticeRound({
  session,
  question,
  replace,
}: {
  session: PracticeSession;
  question: AdditionQuestion;
  replace: (next: PracticeSession) => void;
}) {
  const [typed, setTyped] = useState("");
  const { missFlash, inputLocked, markStart, onCorrect, onWrong, onSkip, onEnd } =
    useRoundCommit(session, question, replace);

  const tryCommit = (nextTyped: string) => {
    if (!shouldCommitTypedAnswer(nextTyped, question.correctAnswer)) {
      return;
    }
    const value = parseTypedAnswer(nextTyped);
    if (value === question.correctAnswer) {
      onCorrect(value);
      return;
    }
    onWrong(value);
  };

  const onDigit = (digit: string) => {
    if (inputLocked) {
      return;
    }
    const nextTyped = `${typed}${digit}`;
    setTyped(nextTyped);
    tryCommit(nextTyped);
  };

  const onBackspace = () => {
    if (inputLocked) {
      return;
    }
    setTyped((prev) => prev.slice(0, -1));
  };

  return (
    <PracticeChrome
      session={session}
      onEnd={onEnd}
      footer={
        <View style={styles.pad}>
          <Keypad
            disabled={inputLocked}
            onDigit={onDigit}
            onBackspace={onBackspace}
            onSkip={onSkip}
          />
        </View>
      }
    >
      <View style={styles.stage} onLayout={markStart}>
        <AdditionStack addends={question.addends} textColor="#F4F4F5" ruleColor="#8B8F97" />
        <View style={[styles.answerBox, missFlash && styles.answerBoxMiss]}>
          <Text style={[styles.answer, missFlash && styles.answerMiss]}>
            {typed.length > 0 ? typed : " "}
          </Text>
        </View>
      </View>
    </PracticeChrome>
  );
}

function VoicePracticeRound({
  session,
  question,
  replace,
}: {
  session: PracticeSession;
  question: AdditionQuestion;
  replace: (next: PracticeSession) => void;
}) {
  const { missFlash, inputLocked, markStart, onCorrect, onWrong, onSkip, onEnd } =
    useRoundCommit(session, question, replace);

  const voice = useVoiceRound({
    questionId: question.id,
    promptSpoken: question.promptSpoken,
    locked: inputLocked,
    onAnswer: (value) => {
      if (value === question.correctAnswer) {
        onCorrect(value);
      } else {
        onWrong(value);
      }
    },
    onSkip,
    onListeningStart: markStart,
  });

  const handleEnd = () => {
    voice.stopAll();
    onEnd();
  };

  const display =
    voice.transcript.trim().length > 0
      ? voice.transcript
      : missFlash
        ? " "
        : " ";

  return (
    <PracticeChrome
      session={session}
      onEnd={handleEnd}
      footer={
        <View style={styles.voiceFooter}>
          <Text style={styles.status}>{voice.statusText}</Text>
          <View style={styles.voiceActions}>
            <Pressable
              disabled={inputLocked}
              onPress={onSkip}
              style={[styles.voiceBtn, inputLocked && styles.voiceBtnDisabled]}
            >
              <Text style={styles.voiceBtnLabel}>Skip</Text>
            </Pressable>
            <Pressable
              disabled={inputLocked || voice.phase === "asking"}
              onPress={voice.listenAgain}
              style={[
                styles.voiceBtn,
                styles.voiceBtnPrimary,
                (inputLocked || voice.phase === "asking") && styles.voiceBtnDisabled,
              ]}
            >
              <Text style={styles.voiceBtnLabel}>Listen again</Text>
            </Pressable>
          </View>
          {voice.phase === "denied" || voice.phase === "unavailable" ? (
            <Text style={styles.hint}>
              Voice needs a development build with microphone permission. Use Typed mode
              from Setup if this keeps failing.
            </Text>
          ) : (
            <Text style={styles.hint}>
              Speak anytime — you can answer while the question is still being read. Live
              text appears above. Tap Listen again if it stops. Set EXPO_PUBLIC_DEEPGRAM_API_KEY
              in apps/mobile/.env for cloud STT.
            </Text>
          )}
        </View>
      }
    >
      <View style={styles.stage}>
        <AdditionStack addends={question.addends} textColor="#F4F4F5" ruleColor="#8B8F97" />
        <View style={[styles.answerBox, missFlash && styles.answerBoxMiss]}>
          <Text style={[styles.answer, missFlash && styles.answerMiss]}>{display}</Text>
        </View>
      </View>
    </PracticeChrome>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0E0F11",
  },
  end: {
    color: "#8B8F97",
    fontSize: 16,
    fontWeight: "600",
    paddingRight: 4,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingHorizontal: 24,
  },
  answerBox: {
    minWidth: 180,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#2E3135",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  answerBoxMiss: {
    borderColor: "#E5484D",
    backgroundColor: "#3B1416",
  },
  answer: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  answerMiss: {
    color: "#FF8A8A",
  },
  pad: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  voiceFooter: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  status: {
    color: "#B0B4BA",
    fontSize: 15,
    textAlign: "center",
  },
  voiceActions: {
    flexDirection: "row",
    gap: 10,
  },
  voiceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#212225",
    alignItems: "center",
  },
  voiceBtnPrimary: {
    backgroundColor: "#2B6CB0",
  },
  voiceBtnDisabled: {
    opacity: 0.45,
  },
  voiceBtnLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    color: "#8B8F97",
    fontSize: 13,
    textAlign: "center",
  },
});
