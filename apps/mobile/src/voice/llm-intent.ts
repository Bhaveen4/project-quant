import type { ParseResult } from "@/engine/parse-answer";

const TIMEOUT_MS = 550;

type LlmIntentJson = {
  kind: "answer" | "skip" | "unknown" | "ambiguous" | "unparsed";
  value?: number | null;
};

export async function interpretAnswerWithLlm(
  transcript: string,
  apiKey: string,
): Promise<ParseResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Extract the user\'s final intended numeric answer from mental-math speech. Return JSON: {"kind":"answer"|"skip"|"unknown"|"ambiguous"|"unparsed","value":number|null}. Use "skip" for pass/skip. Use "unknown" for I don\'t know. Use "ambiguous" for two options without a clear final choice. For corrections ("50 oops 60") return the last intended number. For thinking aloud, return the final answer they assert (e.g. "... is 63" -> 63). Never invent math; only extract intent.',
          },
          { role: "user", content: transcript },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { kind: "unparsed" };
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return { kind: "unparsed" };
    }

    const parsed = JSON.parse(content) as LlmIntentJson;
    if (parsed.kind === "answer" && typeof parsed.value === "number") {
      return { kind: "answer", value: parsed.value };
    }
    if (
      parsed.kind === "skip" ||
      parsed.kind === "unknown" ||
      parsed.kind === "ambiguous" ||
      parsed.kind === "unparsed"
    ) {
      return { kind: parsed.kind };
    }
    return { kind: "unparsed" };
  } catch {
    return { kind: "unparsed" };
  } finally {
    clearTimeout(timer);
  }
}
