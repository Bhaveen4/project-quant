import { StyleSheet, Text, View } from "react-native";

type AdditionStackProps = {
  addends: number[];
  textColor: string;
  ruleColor: string;
};

export function AdditionStack({ addends, textColor, ruleColor }: AdditionStackProps) {
  const last = addends.length - 1;
  const width = Math.max(...addends.map((n) => String(n).length));

  return (
    <View style={styles.wrap} accessibilityRole="text">
      {addends.map((n, i) => (
        <View key={`${n}-${i}`} style={styles.line}>
          <Text style={[styles.op, { color: textColor }]}>{i === last ? "+" : " "}</Text>
          <Text style={[styles.num, { color: textColor }]}>
            {String(n).padStart(width, "\u00A0")}
          </Text>
        </View>
      ))}
      <View style={[styles.rule, { backgroundColor: ruleColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-end",
    gap: 4,
  },
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  op: {
    width: 22,
    fontSize: 32,
    fontWeight: "500",
    textAlign: "right",
  },
  num: {
    fontSize: 40,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
  },
  rule: {
    height: 2,
    alignSelf: "stretch",
    marginTop: 6,
    opacity: 0.5,
  },
});
