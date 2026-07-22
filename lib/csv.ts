/**
 * Minimal, dependency-free CSV builder.
 *
 * Two things every hand-rolled CSV must get right:
 *  1. RFC-4180 quoting — wrap fields containing comma/quote/newline in quotes and
 *     double any embedded quote.
 *  2. Formula-injection defence — a spreadsheet treats a cell starting with
 *     = + - @ (or tab/CR) as a formula. Exported data is attacker-influenced
 *     (contact form input), so prefix those with a single quote.
 */
function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let s = typeof value === "string" ? value : String(value);

  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;

  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: (unknown[])[]): string {
  const lines = [headers.map(sanitizeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(sanitizeCell).join(","));
  }
  // CRLF line endings — the format Excel expects. Leading BOM so Excel reads UTF-8.
  return "﻿" + lines.join("\r\n");
}

/** yyyy-mm-dd for filenames, in the given date's local components. */
export function csvDateStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
