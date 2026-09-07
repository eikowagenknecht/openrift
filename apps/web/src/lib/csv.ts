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
            field += text[position];
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
