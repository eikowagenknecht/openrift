#!/usr/bin/env tsx

/**
 * Formats all markdown tables in .md files under docs/ to be rectangular
 * (columns padded to equal width with aligned pipe separators).
 *
 * Usage: pnpm tsx scripts/format-md-tables.ts [dir]
 *        Defaults to docs/ if no directory given.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2] || "docs";

function formatTable(lines: string[]) {
  // Parse cells (strip leading/trailing whitespace per cell)
  const rows = lines.map((line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );

  const colCount = rows[0].length;

  // Detect alignment from separator row (row index 1)
  const alignments = rows[1].map((cell) => {
    const stripped = cell.replace(/[^:-]/g, "");
    if (stripped.startsWith(":") && stripped.endsWith(":")) return "center";
    if (stripped.endsWith(":")) return "right";
    return "left";
  });

  // Compute max width per column (ignoring separator row)
  const widths = Array.from({ length: colCount }, () => 3); // min width 3 for ---
  for (let i = 0; i < rows.length; i++) {
    if (i === 1) continue; // skip separator
    for (let j = 0; j < colCount; j++) {
      widths[j] = Math.max(widths[j], (rows[i][j] || "").length);
    }
  }

  // Build formatted lines
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === 1) {
      // Separator row
      const sep = widths.map((w, j) => {
        const dashes = "-".repeat(w);
        if (alignments[j] === "center") return `:${dashes}:`;
        if (alignments[j] === "right") return `${dashes}:`;
        return `-${dashes}-`;
      });
      result.push(`|${sep.join("|")}|`);
    } else {
      const cells = widths.map((w, j) => {
        const text = rows[i][j] || "";
        return ` ${text.padEnd(w)} `;
      });
      result.push(`|${cells.join("|")}|`);
    }
  }
  return result;
}

async function* walkMd(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkMd(path);
    else if (entry.name.endsWith(".md")) yield path;
  }
}

let filesChanged = 0;

for await (const filePath of walkMd(root)) {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n");
  const output = [];
  let tableBuffer = [];
  let inTable = false;

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : undefined;
    const isTableLine = line !== undefined && /^\|.*\|/.test(line.trim());

    if (isTableLine) {
      tableBuffer.push(line);
      inTable = true;
    } else {
      if (inTable && tableBuffer.length >= 2) {
        // Check we have a valid separator row
        const sepLine = tableBuffer[1].trim();
        if (/^\|[\s:|-]+\|$/.test(sepLine)) {
          output.push(...formatTable(tableBuffer));
        } else {
          output.push(...tableBuffer);
        }
      } else if (tableBuffer.length > 0) {
        output.push(...tableBuffer);
      }
      tableBuffer = [];
      inTable = false;
      if (line !== undefined) output.push(line);
    }
  }

  const result = output.join("\n");
  if (result !== content) {
    await writeFile(filePath, result, "utf8");
    filesChanged++;
    console.log(`formatted: ${filePath}`);
  }
}

console.log(`\n${filesChanged} file(s) updated.`);
