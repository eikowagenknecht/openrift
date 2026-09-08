import type { Printing } from "@openrift/shared/types/catalog";

export const ANY_LANGUAGE = "any";

export interface ScanLanguageItem {
  value: string;
  label: string;
}

// Includes the selected language even if no printing currently has it, so it stays selectable.
export function scanLanguageItems(
  printings: Printing[],
  selected: string | null,
  labels: Record<string, string>,
): ScanLanguageItem[] {
  return [
    { value: ANY_LANGUAGE, label: "Any language" },
    ...[...new Set([...printings.map((printing) => printing.language), selected ?? "EN"])]
      .toSorted()
      .map((code) => ({ value: code, label: labels[code] ?? code })),
  ];
}
