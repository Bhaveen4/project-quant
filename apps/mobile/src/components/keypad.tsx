import { Pressable, StyleSheet, Text, View } from "react-native";

type KeypadProps = {
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSkip: () => void;
};

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["skip", "0", "back"],
] as const;

export function Keypad({ disabled, onDigit, onBackspace, onSkip }: KeypadProps) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join("-")} style={styles.row}>
          {row.map((key) => {
            const label = key === "back" ? "⌫" : key === "skip" ? "Skip" : key;
            const onPress =
              key === "back" ? onBackspace : key === "skip" ? onSkip : () => onDigit(key);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === "back" ? "Backspace" : label}
                disabled={disabled}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.key,
                  key === "skip" && styles.skipKey,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <Text style={[styles.label, key === "skip" && styles.skipLabel]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 10,
    width: "100%",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "#1F2124",
    alignItems: "center",
    justifyContent: "center",
  },
  skipKey: {
    backgroundColor: "#2E3135",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  skipLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
});
