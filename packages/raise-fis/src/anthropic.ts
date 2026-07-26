import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Export it before running `raise-fis extract`.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
}

/** Claude sometimes wraps JSON responses in ```json fences despite instructions not to. */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function extractTextBlock(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude response contained no text content block");
  }
  return block.text;
}
