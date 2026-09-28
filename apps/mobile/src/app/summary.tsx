import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatAddends, sessionStats } from "@/engine";
import { usePracticeSession } from "@/session/session-context";

function outcomeLabel(outcome: "correct" | "wrong" | "skipped"): string {
  if (outcome === "correct") {
    return "Correct";
  }
  if (outcome === "wrong") {
    return "Wrong";
  }
  return "Skipped";
}

export default function SummaryScreen() {
  const { session, start } = usePracticeSession();

  useEffect(() => {
    if (!session) {
      router.replace("/");
    }
  }, [session]);

  if (!session) {
    return null;
  }

  const stats = sessionStats(session);
  const accuracyPct = Math.round(stats.accuracy * 100);

  const again = () => {
    start(session.settings);
    router.replace("/practice");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: "#0E0F11" },
          headerTintColor: "#FFFFFF",
          headerLeft: () => null,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Session</Text>
        <Text style={styles.score}>
          {stats.correct}/{stats.total - stats.skipped} correct
        </Text>
        <Text style={styles.meta}>
          {accuracyPct}% accuracy
          {stats.medianResponseTimeMs != null
            ? ` · median ${Math.round(stats.medianResponseTimeMs)} ms`
            : ""}
          {stats.skipped > 0 ? ` · ${stats.skipped} skipped` : ""}
        </Text>

        <View style={styles.list}>
          {session.attempts.map((attempt, index) => (
            <View
              key={attempt.question.id}
              style={[
                styles.row,
                attempt.outcome === "wrong" && styles.rowWrong,
                attempt.outcome === "skipped" && styles.rowSkip,
              ]}
            >
              <Text style={styles.index}>{index + 1}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.problem}>{formatAddends(attempt.question.addends)}</Text>
                <Text style={styles.detail}>
                  Your answer: {attempt.givenAnswer ?? "—"} · Correct:{" "}
                  {attempt.question.correctAnswer} · {outcomeLabel(attempt.outcome)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable onPress={() => router.replace("/")} style={styles.secondary}>
          <Text style={styles.secondaryLabel}>Change setup</Text>
        </Pressable>
        <Pressable onPress={again} style={styles.primary}>
          <Text style={styles.primaryLabel}>Again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0E0F11",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 8,
  },
  kicker: {
    color: "#8B8F97",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  score: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
  },
  meta: {
    color: "#B0B4BA",
    fontSize: 15,
    marginBottom: 12,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#16181B",
  },
  rowWrong: {
    backgroundColor: "#2A1416",
  },
  rowSkip: {
    backgroundColor: "#1A1C20",
  },
  index: {
    color: "#8B8F97",
    fontSize: 14,
    fontWeight: "700",
    width: 24,
    paddingTop: 2,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  problem: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  detail: {
    color: "#B0B4BA",
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#212225",
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  primary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2B6CB0",
    alignItems: "center",
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
