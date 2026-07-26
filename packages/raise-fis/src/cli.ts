#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appendCallRecord, readMasterCsv } from "./csv.js";
import { extractCallRecord } from "./extract.js";
import {
  buildCompanyBrief,
  buildCrossCompanyBrief,
  deriveCompany,
  renderCompanyBriefMarkdown,
  renderCrossCompanyBriefMarkdown,
} from "./insights.js";
import { STATUSES, validateCallRecord, type CallRecord } from "./schema.js";

/** Parses `--flag value` / `--boolean-flag` pairs from a slice of argv. Not a general-purpose parser —
 * just enough for this CLI's three subcommands. */
function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function requireFlag(flags: Record<string, string | boolean>, key: string): string {
  const value = flags[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required --${key}`);
  }
  return value;
}

function printIssuesAndFlags(issues: { path: string; message: string }[], reviewFlags: string[]): void {
  if (issues.length > 0) {
    console.error("Validation errors:");
    for (const issue of issues) console.error(`  - ${issue.path || "(root)"}: ${issue.message}`);
  }
  if (reviewFlags.length > 0) {
    console.warn("Review before approving (Step 3 of the operating guide):");
    for (const flag of reviewFlags) console.warn(`  - ${flag}`);
  }
}

async function runExtract(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  const company = requireFlag(flags, "company");
  const founder = requireFlag(flags, "founder");
  const investor = requireFlag(flags, "investor");
  const firm = requireFlag(flags, "firm");
  const callType = requireFlag(flags, "call-type");
  const date = requireFlag(flags, "date");
  const transcriptPath = requireFlag(flags, "transcript");
  const outPath = typeof flags.out === "string" ? flags.out : transcriptPath.replace(/\.[^.]+$/, "") + ".json";

  const transcriptText = readFileSync(transcriptPath, "utf-8");

  console.log(`Extracting from ${transcriptPath} via Claude...`);
  const result = await extractCallRecord({
    company,
    founderName: founder,
    investorName: investor,
    investorFirm: firm,
    callType,
    date,
    transcriptText,
  });

  if (!result.ok) {
    console.error("Extraction failed schema validation. Raw response:");
    console.error(result.rawResponseText);
    printIssuesAndFlags(result.issues, []);
    return 1;
  }

  writeFileSync(outPath, JSON.stringify(result.record, null, 2), "utf-8");
  console.log(`Wrote ${outPath}`);
  printIssuesAndFlags([], result.reviewFlags);
  console.log(`\nNext: review the JSON (Step 3), then run:\n  raise-fis add --json ${outPath} --csv <master-csv-path>`);
  return 0;
}

function runAdd(args: string[]): number {
  const flags = parseFlags(args);
  const jsonPath = requireFlag(flags, "json");
  const csvPath = requireFlag(flags, "csv");
  const overwrite = flags.overwrite === true;
  const statusOverride = typeof flags.status === "string" ? flags.status : undefined;

  const raw: unknown = JSON.parse(readFileSync(jsonPath, "utf-8"));
  if (statusOverride) {
    if (!(STATUSES as readonly string[]).includes(statusOverride)) {
      throw new Error(`--status must be one of: ${STATUSES.join(", ")}`);
    }
    (raw as Record<string, unknown>).status = statusOverride;
  }

  const result = validateCallRecord(raw);
  if (!result.ok || !result.record) {
    printIssuesAndFlags(result.issues, []);
    return 1;
  }

  printIssuesAndFlags([], result.reviewFlags);

  const outcome = appendCallRecord(csvPath, result.record, { overwrite });
  if (outcome.status === "duplicate_rejected") {
    console.error(
      `call_id "${result.record.call_id}" already exists in ${csvPath}. Re-run with --overwrite to replace it.`
    );
    return 1;
  }

  console.log(`${outcome.status === "overwritten" ? "Overwrote" : "Appended"} row for "${result.record.call_id}". ${csvPath} now has ${outcome.totalRows} rows.`);
  return 0;
}

function runInsights(args: string[]): number {
  const flags = parseFlags(args);
  const csvPath = requireFlag(flags, "csv");
  const company = typeof flags.company === "string" ? flags.company : undefined;
  const outPath = typeof flags.out === "string" ? flags.out : undefined;
  const perCompanyDir = typeof flags["per-company-dir"] === "string" ? flags["per-company-dir"] : undefined;

  const { rows, invalidRows } = readMasterCsv(csvPath);
  if (invalidRows.length > 0) {
    console.warn(`${invalidRows.length} row(s) in ${csvPath} failed validation and were excluded from analysis:`);
    for (const bad of invalidRows) console.warn(`  - row ${bad.rowNumber}: ${bad.issues.join("; ")}`);
  }
  const records: CallRecord[] = rows.map((r) => r.record);

  if (perCompanyDir) {
    mkdirSync(perCompanyDir, { recursive: true });
    const byCompany = new Map<string, CallRecord[]>();
    for (const r of records) {
      const list = byCompany.get(deriveCompany(r)) ?? [];
      list.push(r);
      byCompany.set(deriveCompany(r), list);
    }
    for (const [name, recs] of byCompany) {
      const md = renderCompanyBriefMarkdown(buildCompanyBrief(recs));
      const filePath = path.join(perCompanyDir, `${name}.md`);
      writeFileSync(filePath, md, "utf-8");
      console.log(`Wrote ${filePath}`);
    }
  }

  if (company) {
    const filtered = records.filter((r) => deriveCompany(r) === company);
    if (filtered.length === 0) {
      console.error(`No rows found for company "${company}" in ${csvPath}`);
      return 1;
    }
    const md = renderCompanyBriefMarkdown(buildCompanyBrief(filtered));
    if (outPath) {
      writeFileSync(outPath, md, "utf-8");
      console.log(`Wrote ${outPath}`);
    } else {
      console.log(md);
    }
  } else {
    const md = renderCrossCompanyBriefMarkdown(buildCrossCompanyBrief(records));
    if (outPath) {
      writeFileSync(outPath, md, "utf-8");
      console.log(`Wrote ${outPath}`);
    } else {
      console.log(md);
    }
  }

  return 0;
}

function printUsage(): void {
  console.log(`RAISE FIS CLI

Usage:
  raise-fis extract --company <slug> --founder <name> --investor <name> --firm <name> \\
             --call-type <type> --date <YYYY-MM-DD> --transcript <path> [--out <path.json>]

  raise-fis add --json <path.json> --csv <master-csv-path> [--overwrite] [--status pending|approved|corrected]

  raise-fis insights --csv <master-csv-path> [--company <slug>] [--out <path.md>] [--per-company-dir <dir>]
`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  try {
    switch (command) {
      case "extract":
        process.exitCode = await runExtract(rest);
        return;
      case "add":
        process.exitCode = runAdd(rest);
        return;
      case "insights":
        process.exitCode = runInsights(rest);
        return;
      default:
        printUsage();
        process.exitCode = command ? 1 : 0;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main();
