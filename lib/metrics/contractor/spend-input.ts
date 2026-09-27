export function spendMonths(rows: { date?: unknown }[]) {
  return Array.from(new Set(rows.map(row => String(row.date ?? "").trim()).filter(date => /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)).map(date => date.slice(0, 7)))).sort();
}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid month.");
  const [year, number] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` };
}

export function validateSpendRows(rows: any[], month: string) {
  const { start, end } = monthBounds(month);
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error("Add between 1 and 1,000 spend rows per import.");
  return rows.map((row, index) => {
    const date = String(row.date ?? "").trim(), vendor = String(row.vendor ?? "").trim();
    const amount = String(row.spend ?? "").trim().replace(/[$,]/g, "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${index + 1}: the date "${date}" could not be read. Use an Excel date or YYYY-MM-DD.`);
    if (date < start || date > end) throw new Error(`Row ${index + 1}: ${date} is not within the selected month ${month}. Choose ${date.slice(0, 7)} as the import month or exclude this row. Do not change the expense date.`);
    if (!vendor || vendor.length > 200) throw new Error(`Row ${index + 1}: enter a vendor or marketing channel.`);
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Math.abs(Number(amount)) >= 1e12) throw new Error(`Row ${index + 1}: enter a valid dollar amount with at most two decimal places.`);
    const source = String(row.sourceFile ?? "").trim();
    if (source && !/^https:\/\//i.test(source)) throw new Error(`Row ${index + 1}: document links must start with https://.`);
    return { date, vendor, spend: Number(amount), channel: String(row.channel ?? "").slice(0, 200), campaign: String(row.campaign ?? "").slice(0, 500), sourceFile: source.slice(0, 2000) };
  });
}

export function parseSpendCsv(text: string, month: string, validate = true) {
  const records: string[][] = [];
  let record: string[] = [], cell = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      record.push(cell); cell = "";
      if (char !== ',') { if (record.some(value => value.trim())) records.push(record); record = []; if (char === '\r' && text[i + 1] === '\n') i++; }
    } else cell += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted value.");
  record.push(cell); if (record.some(value => value.trim())) records.push(record);
  const headers = (records.shift() ?? []).map(value => value.trim().toLowerCase().replace(/[ _-]/g, ""));
  for (const required of ["date", "vendor", "spend"]) if (!headers.includes(required)) throw new Error(`CSV needs a ${required} column. Use the template.`);
  const rows = records.map(values => Object.fromEntries(headers.map((key, index) => [key === "documenturl" || key === "sourcefile" ? "sourceFile" : key, values[index] ?? ""])));
  if (!rows.length) throw new Error("This file has headers but no spend rows.");
  if (rows.length > 1000) throw new Error("Import at most 1,000 rows at a time.");
  return validate ? validateSpendRows(rows, month) : rows;
}
