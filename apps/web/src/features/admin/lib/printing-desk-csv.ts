import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { formatPrintingCode } from "@openrift/shared/printing-code";

import { escapeCsvField } from "@/features/collections/lib/csv-export";

import { deskImageSrc } from "./printing-desk-image";
import { deskPrintingPeriod, deskPrintingStatus } from "./printing-desk-status";

const HEADERS = [
  "Card",
  "Card slug",
  "Code",
  "Set",
  "Rarity",
  "Finish",
  "Language",
  "Size",
  "Markers",
  "Channel",
  "Status",
  "Announced on",
  "Available from",
  "Precision",
  "Artist",
  "Note",
  "Images",
  "Active image URL",
  "Card URL",
  "Created",
  "Updated",
] as const;

const LIST_SEPARATOR = "; ";

export interface PrintingDeskCsvOptions {
  /** Channel slug to its full `Parent › Leaf` path. */
  channelPaths: ReadonlyMap<string, string>;
  /** Set slug to its display name; the row's own set name is the fallback. */
  setLabels?: ReadonlyMap<string, string>;
  siteUrl?: string;
}

export function printingDeskCardUrl(
  row: Pick<DeskPrintingRow, "cardSlug" | "slug">,
  siteUrl = "",
): string {
  return `${siteUrl}/cards/${row.cardSlug}/${row.slug}`;
}

export function buildPrintingDeskCsv(
  rows: readonly DeskPrintingRow[],
  options: PrintingDeskCsvOptions,
): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    const fields = [
      row.cardName,
      row.cardSlug,
      formatPrintingCode(row.publicCode),
      options.setLabels?.get(row.setSlug) ?? row.setName,
      row.rarity,
      row.finish,
      row.language,
      row.size,
      row.markerSlugs.join(LIST_SEPARATOR),
      row.distributionChannelSlugs
        .map((slug) => options.channelPaths.get(slug) ?? slug)
        .join(LIST_SEPARATOR),
      deskPrintingStatus(row),
      row.announcedAt ?? "",
      deskPrintingPeriod(row),
      row.releasePrecision ?? "",
      row.artist,
      row.comment ?? "",
      String(row.imageCount),
      deskImageSrc(row.activeImageUrl, "full") ?? "",
      printingDeskCardUrl(row, options.siteUrl),
      row.createdAt,
      row.updatedAt,
    ];
    lines.push(fields.map((field) => escapeCsvField(field)).join(","));
  }
  return lines.join("\n");
}

export function printingDeskCsvFilename(mode: string, today: string): string {
  return `printing-desk-${mode}-${today}.csv`;
}
