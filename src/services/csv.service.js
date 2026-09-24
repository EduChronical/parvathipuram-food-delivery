function spreadsheetSafeText(text) {
  // Prevent CSV/Excel formula injection from user-controlled names/text.
  // The leading apostrophe is displayed as literal text by common spreadsheet apps.
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  text = spreadsheetSafeText(text);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

export function rowsToCsv(rows, columns) {
  const header = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(row => columns.map(c => csvCell(row[c.key])).join(',')).join('\r\n');
  return `${header}\r\n${body}${body ? '\r\n' : ''}`;
}
