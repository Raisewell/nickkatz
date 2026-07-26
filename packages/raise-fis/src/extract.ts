import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractTextBlock, getAnthropicClient, getAnthropicModel, stripMarkdownFences } from "./anthropic.js";
import { validateCallRecord, type ValidationResult } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE_PATH = path.join(__dirname, "..", "prompts", "extraction-prompt.md");

/** Pulls the system-prompt block out of prompts/extraction-prompt.md so the CLI and the
 * copy-paste workflow in the operating guide always run off the exact same instructions. */
export function loadSystemPrompt(promptFilePath: string = PROMPT_FILE_PATH): string {
  const md = readFileSync(promptFilePath, "utf-8");
  const start = md.indexOf("<!-- SYSTEM_PROMPT_START -->");
  const end = md.indexOf("<!-- SYSTEM_PROMPT_END -->");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not find SYSTEM_PROMPT markers in ${promptFilePath}`);
  }
  return md.slice(start + "<!-- SYSTEM_PROMPT_START -->".length, end).trim();
}

export interface ExtractionInput {
  company: string;
  founderName: string;
  investorName: string;
  investorFirm: string;
  callType: string;
  date: string;
  transcriptText: string;
}

export function buildUserMessage(input: ExtractionInput): string {
  return [
    `Company: ${input.company}`,
    `Founder: ${input.founderName}`,
    `Investor: ${input.investorName}`,
    `Investor firm: ${input.investorFirm}`,
    `Call type: ${input.callType}`,
    `Date: ${input.date}`,
    "",
    "--- TRANSCRIPT OR SUMMARY BELOW ---",
    input.transcriptText,
  ].join("\n");
}

export interface ExtractResult extends ValidationResult {
  rawResponseText: string;
}

/** Calls Claude with the reconstructed V1 extraction prompt and validates the JSON it returns. */
export async function extractCallRecord(input: ExtractionInput): Promise<ExtractResult> {
  const client = getAnthropicClient();
  const systemPrompt = loadSystemPrompt();

  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const rawResponseText = extractTextBlock(message);
  const cleaned = stripMarkdownFences(rawResponseText);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      issues: [{ path: "", message: `Claude's response was not valid JSON: ${err instanceof Error ? err.message : err}` }],
      reviewFlags: [],
      rawResponseText,
    };
  }

  const validation = validateCallRecord(parsedJson);
  return { ...validation, rawResponseText };
}
