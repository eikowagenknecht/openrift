/**
 * Parses a CSV string into rows of string arrays.
 * Handles quoted fields (with commas and escaped double-quotes inside).
 * @returns Array of rows, each row being an array of field values.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const length = text.length;
  let position = 0;

  while (position < length) {
    const row: string[] = [];

    while (position < length) {
      if (text[position] === '"') {
        // Quoted field
        position++; // skip opening quote
        let field = "";
        while (position < length) {
          if (text[position] === '"') {
            if (position + 1 < length && text[position + 1] === '"') {
              // Escaped double-quote
              field += '"';
              position += 2;
            } else {
              position++; // skip closing quote
              break;
            }
          } else {
            field += text[position];
            position++;
          }
        }
        row.push(field);
      } else {
        // Unquoted field
        const start = position;
        while (
          position < length &&
          text[position] !== "," &&
          text[position] !== "\n" &&
          text[position] !== "\r"
        ) {
          position++;
        }
        row.push(text.slice(start, position));
      }

      if (position < length && text[position] === ",") {
        position++; // skip comma, continue to next field
      } else {
        break; // end of row
      }
    }

    // Skip line endings
    if (position < length && text[position] === "\r") {
      position++;
    }
    if (position < length && text[position] === "\n") {
      position++;
    }

    // Skip empty rows (single empty string)
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parses CSV into an array of objects using the first row as headers.
 * @returns Array of records keyed by header name.
 */
export function parseCSVWithHeaders(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  const records: Record<string, string>[] = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const record: Record<string, string> = {};
    for (let column = 0; column < headers.length; column++) {
      record[headers[column]] = row[column]?.trim() ?? "";
    }
    records.push(record);
  }

  return records;
}
