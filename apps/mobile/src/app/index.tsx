import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceRow } from "@/components/choice-row";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  type SessionSettings,
} from "@/engine";
import { usePracticeSession } from "@/session/session-context";

const DIGIT_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
];

const ROW_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
];

const COUNT_PRESETS = [10, 20, 50, 100];

function clampCount(n: number): number {
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, n));
}

function exampleFor(settings: { mixed: boolean; digits: number; rows: number }): string {
  if (settings.mixed) {
    return "Anything: 1 + 1, 1 + 3 + 4, 1 + 23 + 434";
  }
  const count = settings.rows + 1;
  const sample = Array.from({ length: count }, () =>
    settings.digits === 1 ? "1" : settings.digits === 2 ? "21" : "101",
  );
  return sample.join(" + ");
}

export default function SetupScreen() {
  const { start } = usePracticeSession();
  const [mixed, setMixed] = useState(false);
  const [digits, setDigits] = useState(1);
  const [rows, setRows] = useState(1);
  const [questionCount, setQuestionCount] = useState(20);
  const [inputMode, setInputMode] = useState<"typed" | "voice">("typed");

  const startSession = () => {
    const settings: SessionSettings = {
      mixed,
      digits,
      rows,
      questionCount: clampCount(questionCount),
      inputMode,
    };
    start(settings);
    router.push("/practice");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>Addition drill</Text>
        <Text style={styles.subtitle}>{exampleFor({ mixed, digits, rows })}</Text>

        <ChoiceRow
          label="Mode"
          value={mixed ? "mixed" : "fixed"}
          options={[
            { value: "fixed", label: "Fixed" },
            { value: "mixed", label: "Mixed" },
          ]}
          onChange={(value) => setMixed(value === "mixed")}
        />

        <ChoiceRow
          label="Digits per number"
          value={digits}
          options={DIGIT_OPTIONS}
          disabled={mixed}
          onChange={setDigits}
        />

        <ChoiceRow
          label="Rows (extra addends)"
          value={rows}
          options={ROW_OPTIONS}
          disabled={mixed}
          onChange={setRows}
        />

        <Text style={styles.hint}>
          {mixed
            ? "Each question picks 2–4 numbers, each 1–3 digits."
            : `${rows} row${rows === 1 ? "" : "s"} means ${rows + 1} numbers to add.`}
        </Text>

        <ChoiceRow
          label="Input"
          value={inputMode}
          options={[
            { value: "typed", label: "Typed" },
            { value: "voice", label: "Voice" },
          ]}
          onChange={setInputMode}
        />

        {inputMode === "voice" ? (
          <Text style={styles.hint}>
            Voice needs a development build (not Expo Go). The question is spoken, then
            the mic listens. Say “skip” or “pass” to skip.
          </Text>
        ) : null}

        <ChoiceRow
          label="Questions"
          value={questionCount}
          options={COUNT_PRESETS.map((n) => ({ value: n, label: String(n) }))}
          onChange={setQuestionCount}
        />

        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel="Fewer questions"
            onPress={() => setQuestionCount((n) => clampCount(n - 5))}
            style={styles.stepBtn}
          >
            <Text style={styles.stepLabel}>−5</Text>
          </Pressable>
          <Text style={styles.countValue}>{questionCount}</Text>
          <Pressable
            accessibilityLabel="More questions"
            onPress={() => setQuestionCount((n) => clampCount(n + 5))}
            style={styles.stepBtn}
          >
            <Text style={styles.stepLabel}>+5</Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={startSession} style={styles.start}>
        <Text style={styles.startLabel}>Start</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0E0F11",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  body: {
    flex: 1,
    gap: 22,
    paddingTop: 24,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: "#B0B4BA",
    fontSize: 16,
  },
  hint: {
    color: "#8B8F97",
    fontSize: 13,
    marginTop: -8,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  stepBtn: {
    minWidth: 64,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#212225",
    alignItems: "center",
  },
  stepLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  countValue: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 64,
    textAlign: "center",
  },
  start: {
    backgroundColor: "#2B6CB0",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  startLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
});
