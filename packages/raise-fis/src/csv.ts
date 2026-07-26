import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { CALL_RECORD_COLUMNS, SCORE_FIELDS, callRecordSchema, type CallRecord } from "./schema.js";

/** Converts CSV string cells for score fields back to numbers before zod validation. */
function coerceRow(row: Record<string, string>): Record<string, unknown> {
  const coerced: Record<string, unknown> = { ...row };
  for (const field of SCORE_FIELDS) {
    if (row[field] !== undefined && row[field] !== "") {
      const n = Number(row[field]);
      coerced[field] = Number.isNaN(n) ? row[field] : n;
    }
  }
  return coerced;
}

export interface CsvRow {
  record: CallRecord;
  rowNumber: number; // 1-indexed, header is row 0
}

export interface ReadCsvResult {
  rows: CsvRow[];
  invalidRows: { rowNumber: number; issues: string[] }[];
}

/** Reads and validates the master CSV. Rows that fail schema validation are reported, not thrown. */
export function readMasterCsv(csvPath: string): ReadCsvResult {
  if (!existsSync(csvPath)) {
    return { rows: [], invalidRows: [] };
  }

  // Real-world exports (Google Sheets, copy-paste) routinely mix \r\n and \n within
  // the same file; normalize so a stray \r never leaks into the last column's value.
  const raw = readFileSync(csvPath, "utf-8").replace(/\r\n/g, "\n");
  if (raw.trim().length === 0) {
    return { rows: [], invalidRows: [] };
  }

  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
  });

  const rows: CsvRow[] = [];
  const invalidRows: { rowNumber: number; issues: string[] }[] = [];

  records.forEach((raw_, i) => {
    const rowNumber = i + 1;
    const parsed = callRecordSchema.safeParse(coerceRow(raw_));
    if (parsed.success) {
      rows.push({ record: parsed.data, rowNumber });
    } else {
      invalidRows.push({
        rowNumber,
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
    }
  });

  return { rows, invalidRows };
}

function toCsvRecord(record: CallRecord): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const col of CALL_RECORD_COLUMNS) {
    out[col] = record[col];
  }
  return out;
}

function writeAll(csvPath: string, records: CallRecord[]): void {
  const csv = stringify(records.map(toCsvRecord), {
    header: true,
    columns: CALL_RECORD_COLUMNS as unknown as string[],
  });
  writeFileSync(csvPath, csv, "utf-8");
}

export interface AppendOptions {
  /** Replace an existing row with the same call_id instead of erroring. */
  overwrite?: boolean;
}

export interface AppendResult {
  status: "appended" | "overwritten" | "duplicate_rejected";
  totalRows: number;
}

/**
 * Appends one validated call record to the master CSV (creating the file with
 * a header if it doesn't exist yet). Rejects duplicate call_ids unless
 * `overwrite` is set, since call_id is the dataset's natural key.
 */
export function appendCallRecord(csvPath: string, record: CallRecord, opts: AppendOptions = {}): AppendResult {
  const { rows } = readMasterCsv(csvPath);
  const existingIndex = rows.findIndex((r) => r.record.call_id === record.call_id);

  if (existingIndex !== -1 && !opts.overwrite) {
    return { status: "duplicate_rejected", totalRows: rows.length };
  }

  const allRecords = rows.map((r) => r.record);
  if (existingIndex !== -1) {
    allRecords[existingIndex] = record;
    writeAll(csvPath, allRecords);
    return { status: "overwritten", totalRows: allRecords.length };
  }

  allRecords.push(record);
  writeAll(csvPath, allRecords);
  return { status: "appended", totalRows: allRecords.length };
}
