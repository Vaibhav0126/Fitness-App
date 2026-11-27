/**
 * Small RFC 4180 CSV reader: quoted fields, escaped quotes, CRLF/LF, BOM,
 * and delimiter auto-detection (comma, semicolon, tab).
 */

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (d: string) => firstLine.split(d).length - 1;
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** Header row + records keyed by header name. */
export function csvToRecords(text: string): { headers: string[]; records: Array<Record<string, string>> } {
  const [headers = [], ...body] = parseCsv(text);
  const clean = headers.map((h) => h.trim());
  return {
    headers: clean,
    records: body.map((r) => Object.fromEntries(clean.map((h, i) => [h, (r[i] ?? "").trim()]))),
  };
}
