export function getDeepgramApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

export function getOpenAiApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

export function useDeepgramVoice(): boolean {
  return getDeepgramApiKey() != null;
}
