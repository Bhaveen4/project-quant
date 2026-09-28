import { Pressable, StyleSheet, Text, View } from "react-native";

type Option<T extends string | number> = {
  value: T;
  label: string;
};

type ChoiceRowProps<T extends string | number> = {
  label: string;
  value: T;
  options: Option<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
};

export function ChoiceRow<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: ChoiceRowProps<T>) {
  return (
    <View style={styles.block}>
      <Text style={[styles.label, disabled && styles.dim]}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                disabled && styles.dim,
              ]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
  },
  label: {
    color: "#B0B4BA",
    fontSize: 14,
    fontWeight: "600",
  },
  dim: {
    opacity: 0.4,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#212225",
  },
  chipSelected: {
    backgroundColor: "#2B6CB0",
  },
  chipLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  chipLabelSelected: {
    color: "#FFFFFF",
  },
});
