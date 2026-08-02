import { appendSetTotal, fixTypography, WellKnown, ERROR_CODES } from "@openrift/shared";
import type { ArtVariant, CardSize, Finish, Rarity } from "@openrift/shared/types";

import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { Io } from "../io.js";
import { assertFound } from "../lib/assertions.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type {
  catalogDeleteGuardsRepo,
  PrintingDeleteBlockers,
} from "../repositories/catalog-delete-guards.js";
import type { catalogMutationsRepo } from "../repositories/catalog-mutations.js";
import type { distributionChannelsRepo } from "../repositories/distribution-channels.js";
import type { markersRepo } from "../repositories/markers.js";
import type { printingEventsRepo } from "../repositories/printing-events.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import { rehostSingleImage } from "./images/jobs.js";
import { deleteRehostFiles } from "./images/variants.js";
import { recordNewPrintingEvent } from "./record-printing-event.js";

type CatalogMutationsRepo = ReturnType<typeof catalogMutationsRepo>;
type CandidateCardsRepo = ReturnType<typeof candidateCardsRepo>;
type CatalogDeleteGuardsRepo = ReturnType<typeof catalogDeleteGuardsRepo>;
type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;
type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type MarkersRepo = ReturnType<typeof markersRepo>;
type DistributionChannelsRepo = ReturnType<typeof distributionChannelsRepo>;

// ── updatePrintingMarkers ────────────────────────────────────────────────────

/**
 * Replace a printing's marker set. Runs inside a transaction so the sync
 * trigger's intermediate `marker_slugs = {}` state between DELETE and INSERT
 * on `printing_markers` only has to satisfy the deferrable uniqueness checks
 * at commit time, after the final value is in place.
 *
 * @returns Promise that resolves when the marker set has been replaced.
 */
export async function updatePrintingMarkers(
  transact: Transact,
  printingId: string,
  newSlugs: readonly string[],
): Promise<void> {
  await transact(async (trxRepos) => {
    const printing = await trxRepos.catalogMutations.getPrintingById(printingId);
    assertFound(printing, "Printing not found");

    if (newSlugs.length === 0) {
      await trxRepos.markers.setForPrinting(printingId, []);
      return;
    }

    const markerRows = await trxRepos.markers.listBySlugs(newSlugs);
    const known = new Set(markerRows.map((m) => m.slug));
    const missing = newSlugs.filter((s) => !known.has(s));
    if (missing.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown marker slug(s): ${missing.join(", ")}`,
      );
    }

    await trxRepos.markers.setForPrinting(
      printingId,
      markerRows.map((m) => m.id),
    );
  });
}

/**
 * Replace a printing's distribution channel set by slug.
 */
export async function updatePrintingDistributionChannels(
  repos: {
    catalogMutations: CatalogMutationsRepo;
    distributionChannels: DistributionChannelsRepo;
  },
  printingId: string,
  newSlugs: readonly string[],
): Promise<void> {
  const printing = await repos.catalogMutations.getPrintingById(printingId);
  assertFound(printing, "Printing not found");

  if (newSlugs.length === 0) {
    await repos.distributionChannels.setForPrinting(printingId, []);
    return;
  }

  const channelRows = await repos.distributionChannels.listBySlugs(newSlugs);
  const known = new Set(channelRows.map((c) => c.slug));
  const missing = newSlugs.filter((s) => !known.has(s));
  if (missing.length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Unknown distribution channel slug(s): ${missing.join(", ")}`,
    );
  }

  await repos.distributionChannels.setForPrinting(
    printingId,
    channelRows.map((c) => ({ channelId: c.id })),
  );
}

// ── deletePrinting ──────────────────────────────────────────────────────────

/**
 * Delete a printing's rows inside an already-open transaction: unlink its
 * candidate printings, drop its images and link overrides, then the printing
 * row itself.
 * @returns Image file IDs that may be orphaned once the transaction commits.
 */
export async function deletePrintingRows(
  trxRepos: { catalogMutations: CatalogMutationsRepo; candidateCards: CandidateCardsRepo },
  printingId: string,
): Promise<string[]> {
  await trxRepos.candidateCards.unlinkCandidatePrintingsByPrintingId(printingId);
  const images = await trxRepos.catalogMutations.deletePrintingImagesByPrintingId(printingId);
  await trxRepos.candidateCards.deletePrintingLinkOverridesById(printingId);
  await trxRepos.catalogMutations.deletePrintingById(printingId);
  return images.map((img) => img.imageFileId);
}

/**
 * Delete image files (DB row + rehosted files) that no longer have any
 * references. Runs outside the deleting transaction: rehost deletion touches
 * external storage and must only happen after the DB delete is committed.
 * @returns Promise that resolves when the orphaned files are gone.
 */
export async function cleanupOrphanedImageFiles(
  io: Io,
  mut: CatalogMutationsRepo,
  imageFileIds: string[],
): Promise<void> {
  for (const imageFileId of imageFileIds) {
    const imageFile = await mut.getImageFileById(imageFileId);
    if (!imageFile) {
      continue;
    }
    const stillReferenced = await mut.isImageFileReferenced(imageFileId);
    if (!stillReferenced) {
      if (imageFile.rehostedUrl) {
        await deleteRehostFiles(io, imageFile.rehostedUrl);
      }
      await mut.deleteImageFileById(imageFileId);
    }
  }
}

const PRINTING_BLOCKER_LABELS: Record<keyof PrintingDeleteBlockers, string> = {
  copies: "collection copies",
  collectionEvents: "collection history entries",
  listEntries: "list entries",
  loans: "loans",
  cardTrades: "trades",
  marketplaceProductVariants: "marketplace variant mappings",
  productPrintings: "marketplace product mappings",
};

/**
 * Throw a CONFLICT AppError naming every non-zero blocker count (the
 * printing-scoped mirror of card-admin's `throwIfBlocked`).
 * @returns Nothing; returns normally when all counts are zero.
 */
function throwIfPrintingBlocked(blockers: PrintingDeleteBlockers): void {
  const blocking = Object.entries(blockers).filter(([, count]) => count > 0);
  if (blocking.length > 0) {
    const detail = blocking
      .map(
        ([source, count]) =>
          `${PRINTING_BLOCKER_LABELS[source as keyof PrintingDeleteBlockers]} (${count})`,
      )
      .join(", ");
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      `Printing cannot be deleted, it is still referenced by: ${detail}`,
    );
  }
}

/**
 * Delete a printing and clean up all related data. Referencing user data
 * (copies, list entries, trades, ...) blocks the delete with a typed 409
 * naming the blockers, instead of surfacing the raw FK violation as a 500.
 */
export async function deletePrinting(
  transact: Transact,
  io: Io,
  repos: { catalogMutations: CatalogMutationsRepo; catalogDeleteGuards: CatalogDeleteGuardsRepo },
  printingId: string,
): Promise<void> {
  const mut = repos.catalogMutations;
  const guards = repos.catalogDeleteGuards;

  const printing = await mut.getPrintingById(printingId);
  assertFound(printing, "Printing not found");

  throwIfPrintingBlocked(await guards.countForPrinting(printing.id));

  let deletedImageFileIds: string[];
  try {
    deletedImageFileIds = await transact((trxRepos) => deletePrintingRows(trxRepos, printing.id));
  } catch (error: unknown) {
    // 23503 = foreign_key_violation: a referencing row appeared between the
    // blocker check and the delete — re-check so the client gets the same
    // CONFLICT it would have gotten had the row existed up front.
    if (error instanceof Error && "code" in error && error.code === "23503") {
      throwIfPrintingBlocked(await guards.countForPrinting(printing.id));
    }
    throw error;
  }

  await cleanupOrphanedImageFiles(io, mut, deletedImageFileIds);
}

// ── acceptPrinting ───────────────────────────────────────────────────────────

interface AcceptPrintingFields {
  shortCode: string;
  setId?: string;
  setName?: string | null;
  rarity?: string | null;
  artVariant?: string;
  isSigned?: boolean;
  markerSlugs?: string[];
  distributionChannelSlugs?: string[];
  finish?: string;
  size?: string;
  artist: string;
  publicCode: string;
  printedRulesText?: string | null;
  printedEffectText?: string | null;
  flavorText?: string | null;
  imageUrl?: string | null;
  language?: string;
  printedName?: string | null;
  printedYear?: number | null;
}

/**
 * Create a new printing from admin-selected fields and link all sources in the group.
 * @returns The new printing UUID.
 */
export async function acceptPrinting(
  transact: Transact,
  repos: {
    catalogMutations: CatalogMutationsRepo;
    printingImages: PrintingImagesRepo;
    markers: MarkersRepo;
    distributionChannels: DistributionChannelsRepo;
    printingEvents?: PrintingEventsRepo;
  },
  cardId: string,
  printingFields: AcceptPrintingFields,
  candidatePrintingIds: string[],
  io: Io,
): Promise<string> {
  if (!printingFields.setId) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "printingFields.setId is required");
  }

  const mut = repos.catalogMutations;

  const markerSlugs = [...(printingFields.markerSlugs ?? [])].sort();
  const channelSlugs = printingFields.distributionChannelSlugs ?? [];

  const markerRows = await repos.markers.listBySlugs(markerSlugs);
  if (markerRows.length !== markerSlugs.length) {
    const known = new Set(markerRows.map((m) => m.slug));
    const missing = markerSlugs.filter((s) => !known.has(s));
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Unknown marker slug(s): ${missing.join(", ")}`,
    );
  }

  const channelRows = await repos.distributionChannels.listBySlugs(channelSlugs);
  if (channelRows.length !== channelSlugs.length) {
    const known = new Set(channelRows.map((c) => c.slug));
    const missing = channelSlugs.filter((s) => !known.has(s));
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Unknown distribution channel slug(s): ${missing.join(", ")}`,
    );
  }

  const card = await mut.getCardById(cardId);
  if (!card) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
  }

  const finish = (printingFields.finish ?? WellKnown.finish.NORMAL) as Finish;
  const size = (printingFields.size ?? WellKnown.cardSize.STANDARD) as CardSize;
  const language = printingFields.language ?? WellKnown.language.EN;
  const existing = await mut.getPrintingCardIdByComposite(
    printingFields.shortCode,
    finish,
    markerSlugs,
    language,
  );
  if (existing && existing.cardId !== cardId) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      `Printing "${printingFields.shortCode}:${finish}:${language}" already belongs to a different card`,
    );
  }

  let insertedId = "";
  let insertedImageId: string | null = null;

  await transact(async (trxRepos) => {
    if (printingFields.setId) {
      await trxRepos.sets.upsert(
        printingFields.setId,
        printingFields.setName ?? printingFields.setId,
      );
    }

    let setUuid = "";
    let setPrintedTotal: number | null = null;
    if (printingFields.setId) {
      const setRow = await trxRepos.catalogMutations.getSetIdBySlug(printingFields.setId);
      setUuid = setRow?.id ?? "";
      if (setUuid) {
        const setTotalRow = await trxRepos.sets.getPrintedTotal(setUuid);
        setPrintedTotal = setTotalRow?.printedTotal ?? null;
      }
    }

    const rawRarity = String(printingFields.rarity || WellKnown.rarity.COMMON);
    const rarityRows = await trxRepos.rarities.listAll();
    const raritySlugs = rarityRows.map((row) => row.slug);
    const normalizedRarity = raritySlugs.find(
      (slug) => slug.toLowerCase() === rawRarity.toLowerCase(),
    );
    if (!normalizedRarity) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Invalid rarity "${rawRarity}". Must be one of: ${raritySlugs.join(", ")}`,
      );
    }

    const costKeywords = await trxRepos.keywords.listCostKeywords();

    insertedId = await trxRepos.catalogMutations.upsertPrinting({
      cardId,
      setId: setUuid,
      shortCode: printingFields.shortCode,
      rarity: normalizedRarity as Rarity,
      artVariant: (printingFields.artVariant ?? WellKnown.artVariant.NORMAL) as ArtVariant,
      isSigned: printingFields.isSigned ?? false,
      markerSlugs,
      finish,
      size,
      artist: printingFields.artist,
      publicCode: appendSetTotal(printingFields.publicCode, setPrintedTotal),
      printedRulesText: fixTypography(printingFields.printedRulesText ?? null, { costKeywords }),
      printedEffectText: fixTypography(printingFields.printedEffectText ?? null, { costKeywords }),
      flavorText: fixTypography(printingFields.flavorText ?? null, {
        italicParens: false,
        keywordGlyphs: false,
      }),
      language,
      printedName: printingFields.printedName ?? null,
      printedYear: printingFields.printedYear ?? null,
    });

    // Sync the M2M joins to match the requested marker/channel slugs.
    await trxRepos.markers.setForPrinting(
      insertedId,
      markerRows.map((m) => m.id),
    );
    await trxRepos.distributionChannels.setForPrinting(
      insertedId,
      channelRows.map((c) => ({ channelId: c.id })),
    );

    await trxRepos.keywords.recomputeForPrintingCard(insertedId);

    if (printingFields.imageUrl) {
      insertedImageId = await trxRepos.printingImages.insertImage(
        insertedId,
        printingFields.imageUrl,
      );
    }

    if (candidatePrintingIds.length > 0) {
      await trxRepos.candidateCards.linkAndCheckCandidatePrintings(
        candidatePrintingIds,
        insertedId,
      );
    }
  });

  if (repos.printingEvents) {
    await recordNewPrintingEvent(repos.printingEvents, insertedId);
  }

  // Rehost the image we just inserted so it is self-hosted right away instead
  // of falling back to its external URL until some later rehost run picks it up.
  // Targets the exact inserted image (not a blind batch sweep) and is fire-and-
  // forget to avoid blocking the response on a slow external download. Every
  // accept path funnels through here, so this is the single place that rehosts
  // on accept, including the card-review (partial-admin) per-printing accept,
  // which previously left its image un-rehosted.
  if (insertedImageId) {
    // oxlint-disable-next-line promise/prefer-await-to-then -- intentionally fire-and-forget to avoid blocking the response
    rehostSingleImage(io, repos.printingImages, insertedImageId).catch(() => {
      // Non-fatal; an un-rehosted image falls back to its external URL and is
      // picked up by the next rehost batch.
    });
  }

  return insertedId;
}
