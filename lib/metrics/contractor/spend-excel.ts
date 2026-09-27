import * as XLSX from "xlsx";
import { validateSpendRows } from "./spend-input";

export function readSpendWorkbook(bytes: ArrayBuffer) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false, sheetRows: 1002, cellFormula: true });
  const sheets = workbook.SheetNames.filter(name => !workbook.Workbook?.Sheets?.find(sheet => sheet.name === name)?.Hidden);
  if (!sheets.length) throw new Error("This workbook has no visible worksheets.");
  return { workbook, sheets };
}

export function parseSpendSheet(workbook: XLSX.WorkBook, sheetName: string, month: string, validate = true) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Choose a worksheet.");
  const range = sheet["!fullref"] || sheet["!ref"];
  if (range && XLSX.utils.decode_range(range).e.r > 1000) throw new Error("Use a worksheet with a header and at most 1,000 spend rows. Remove extra totals or formatting below your data.");
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  const normalize = (value: unknown) => String(value).trim().toLowerCase().replace(/[ _-]/g, "");
  const aliases: Record<string, string> = { transactiondate: "date", name: "vendor", amount: "spend", distributionaccount: "channel" };
  const headerIndex = matrix.findIndex(values => {
    const names = values.map(value => aliases[normalize(value)] || normalize(value));
    return ["date", "vendor", "spend"].every(name => names.includes(name));
  });
  if (headerIndex < 0) throw new Error("Missing spend columns. Use Date, Vendor, Spend or Transaction date, Name, Amount.");
  const originalHeaders = matrix[headerIndex].map(normalize);
  const groupedReport = originalHeaders.includes("transactiondate") && originalHeaders.includes("transactiontype") && originalHeaders.includes("amount");
  const headers = originalHeaders.map(name => aliases[name] || name);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("The worksheet has duplicate column names.");
  // Never evaluate formulas or external links. A saved Excel result is required.
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const value = cell as XLSX.CellObject;
    const column = XLSX.utils.decode_cell(address).c;
    if (["date", "vendor", "spend"].includes(headers[column]) && (value.t === "e" || (value.f && value.v == null))) {
      throw new Error(`Cell ${address} has an error or an unsaved formula result. Recalculate and save the workbook in Excel first.`);
    }
  }
  const data = matrix.slice(headerIndex + 1).filter(values => {
    if (!groupedReport) return true;
    // Group headings and totals have neither a transaction date nor a type.
    return String(values[headers.indexOf("date")] ?? "").trim() !== "" || String(values[headers.indexOf("transactiontype")] ?? "").trim() !== "";
  });
  const rows = data.map(values => Object.fromEntries(headers.map((key, index) => {
    let value = values[index] ?? "";
    if (key === "date" && typeof value === "number") {
      const date = XLSX.SSF.parse_date_code(value, { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
      if (!date || (date.y === 1900 && date.m === 2 && date.d === 29)) throw new Error("The worksheet contains an invalid Excel date.");
      value = `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    if (key === "date" && typeof value === "string") {
      const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) value = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    }
    return [key === "documenturl" || key === "sourcefile" ? "sourceFile" : key, value];
  })));
  if (!rows.length) throw new Error("This worksheet has headers but no spend rows.");
  return validate ? validateSpendRows(rows, month) : rows;
}
