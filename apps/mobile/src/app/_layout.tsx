import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { SessionProvider } from "@/session/session-context";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SessionProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            contentStyle: { backgroundColor: "#0E0F11" },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="practice" options={{ title: "Practice", headerBackVisible: false }} />
          <Stack.Screen name="summary" options={{ title: "Summary", headerBackVisible: false }} />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  );
}
