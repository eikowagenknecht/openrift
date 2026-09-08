import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import type { SetRelease } from "@openrift/shared/set-release";
import { formatReleasePeriod, isReleased } from "@openrift/shared/set-release";

export type DeskPrintingStatus = "announced" | "released";

export const DESK_STATUS_LABELS: Record<DeskPrintingStatus, string> = {
  announced: "Announced",
  released: "Released",
};

type ReleaseFields = Pick<DeskPrintingRow, "releasedAt" | "releasePrecision">;

export function deskPrintingRelease(row: ReleaseFields): SetRelease {
  return { releasedAt: row.releasedAt, precision: row.releasePrecision };
}

export function deskPrintingStatus(row: ReleaseFields, today?: string): DeskPrintingStatus {
  return isReleased(deskPrintingRelease(row), today) ? "released" : "announced";
}

export function deskPrintingPeriod(row: ReleaseFields): string {
  return formatReleasePeriod(deskPrintingRelease(row));
}
