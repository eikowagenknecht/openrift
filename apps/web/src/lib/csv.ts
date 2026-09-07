export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const length = text.length;
  let position = 0;

  while (position < length) {
    const row: string[] = [];

    while (position < length) {
      if (text[position] === '"') {
        position++;
        let field = "";
        while (position < length) {
          if (text[position] === '"') {
            if (position + 1 < length && text[position + 1] === '"') {
              field += '"';
              position += 2;
            } else {
              position++;
              break;
            }
          } else {
            field += text.charAt(position);
            position++;
          }
        }
        row.push(field);
      } else {
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
        position++;
      } else {
        break;
      }
    }

    if (position < length && text[position] === "\r") {
      position++;
    }
    if (position < length && text[position] === "\n") {
      position++;
    }

    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

export function parseCSVWithHeaders(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  const [headerRow] = rows;
  if (headerRow === undefined) {
    return [];
  }

  const headers = headerRow.map((header) => header.trim());
  const records: Record<string, string>[] = [];

  for (const row of rows.slice(1)) {
    const record: Record<string, string> = {};
    for (const [column, header] of headers.entries()) {
      record[header] = row[column]?.trim() ?? "";
    }
    records.push(record);
  }

  return records;
}
