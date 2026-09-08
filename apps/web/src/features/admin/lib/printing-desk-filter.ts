import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { formatPrintingCode } from "@openrift/shared/printing-code";

import type { DeskPrintingStatus } from "./printing-desk-status";
import { deskPrintingStatus } from "./printing-desk-status";

export type DeskStatusFilter = "any" | DeskPrintingStatus;

export interface DeskFilter {
  query: string;
  status: DeskStatusFilter;
}

export function matchesDeskFilter(row: DeskPrintingRow, filter: DeskFilter): boolean {
  if (filter.status !== "any" && deskPrintingStatus(row) !== filter.status) {
    return false;
  }
  const query = filter.query.trim().toLowerCase();
  if (query.length === 0) {
    return true;
  }
  return [row.cardName, row.cardSlug, formatPrintingCode(row.publicCode), row.publicCode].some(
    (field) => field.toLowerCase().includes(query),
  );
}

export function filterDeskPrintings(
  rows: readonly DeskPrintingRow[],
  filter: DeskFilter,
): DeskPrintingRow[] {
  return rows.filter((row) => matchesDeskFilter(row, filter));
}

export type DeskSort = "code" | "card" | "updated" | "release";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const DESK_SORTS: Record<DeskSort, (a: DeskPrintingRow, b: DeskPrintingRow) => number> = {
  code: (a, b) =>
    collator.compare(a.shortCode, b.shortCode) ||
    collator.compare(a.language, b.language) ||
    collator.compare(a.finish, b.finish),
  card: (a, b) => collator.compare(a.cardName, b.cardName) || DESK_SORTS.code(a, b),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || DESK_SORTS.code(a, b),
  release: (a, b) =>
    (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "") || DESK_SORTS.code(a, b),
};

export function sortDeskPrintings(
  rows: readonly DeskPrintingRow[],
  sort: DeskSort,
): DeskPrintingRow[] {
  return rows.toSorted(DESK_SORTS[sort]);
}

export function imageCountText(count: number): string {
  if (count === 0) {
    return "no images";
  }
  return count === 1 ? "1 image" : `${count} images`;
}
