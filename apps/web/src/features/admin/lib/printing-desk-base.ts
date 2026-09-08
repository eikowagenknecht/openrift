import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";

export function basePrintingForLanguage(
  printings: readonly DeskPrintingRow[],
  language: string,
): DeskPrintingRow | undefined {
  return printings.find((printing) => printing.language === language) ?? printings.at(0);
}

export function defaultCardLanguage(
  languages: readonly string[],
  preferred: readonly string[],
): string {
  return preferred.find((code) => languages.includes(code)) ?? languages.at(0) ?? "en";
}
