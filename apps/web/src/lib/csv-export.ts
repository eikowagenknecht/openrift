import type { StackedEntry } from "@/hooks/use-stacked-copies";

const HEADERS = [
  "Card ID",
  "Card Name",
  "Rarity",
  "Type",
  "Domain",
  "Finish",
  "Art Variant",
  "Quantity",
] as const;

function escapeField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/**
 * Generates a CSV string from stacked copy entries.
 * @returns CSV text with headers and one row per unique printing.
 */
export function generateExportCSV(stacks: StackedEntry[]): string {
  const lines: string[] = [HEADERS.join(",")];

  for (const stack of stacks) {
    const { printing } = stack;
    const row = [
      printing.shortCode,
      printing.card.name,
      printing.rarity,
      printing.card.type,
      printing.card.domains.join(" / "),
      printing.finish,
      printing.artVariant,
      String(stack.copyIds.length),
    ].map((field) => escapeField(field));
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Triggers a browser download of the given text content as a CSV file.
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
