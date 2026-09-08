import type { DeskImage, DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";

import type {
  DeskImageRow,
  DeskPrintingRow as DeskPrintingDbRow,
} from "../repositories/printing-desk.js";

export function toDeskPrintingRow(
  row: DeskPrintingDbRow,
  { createdByMe, isAdmin }: { createdByMe: boolean; isAdmin: boolean },
): DeskPrintingRow {
  return {
    printingId: row.printingId,
    slug: row.slug,
    cardId: row.cardId,
    cardSlug: row.cardSlug,
    cardName: row.cardName,
    cardType: row.cardType,
    setId: row.setId,
    setName: row.setName,
    setSlug: row.setSlug,
    shortCode: row.shortCode,
    publicCode: row.publicCode,
    rarity: row.rarity,
    finish: row.finish,
    language: row.language,
    size: row.size,
    artist: row.artist,
    markerSlugs: row.markerSlugs,
    distributionChannelSlugs: row.distributionChannelSlugs,
    announcedAt: row.announcedAt,
    releasedAt: row.releasedAt,
    releasePrecision: row.releasePrecision,
    comment: row.comment,
    imageCount: row.imageCount,
    activeImageFileId: row.activeImageFileId,
    activeImageUrl: row.activeImageUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: isAdmin || row.isPromo || createdByMe,
  };
}

export function toDeskImages(
  rows: readonly DeskImageRow[],
  deletableIds: ReadonlySet<string>,
): DeskImage[] {
  return rows
    .filter((row): row is DeskImageRow & { url: string } => row.url !== null)
    .map((row) => ({
      printingImageId: row.printingImageId,
      imageFileId: row.imageFileId,
      url: row.url,
      isActive: row.isActive,
      rotation: row.rotation,
      face: row.face,
      credit: row.credit,
      canDelete: deletableIds.has(row.printingImageId),
    }));
}
