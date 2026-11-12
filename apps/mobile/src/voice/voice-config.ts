export function getGeminiApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}
