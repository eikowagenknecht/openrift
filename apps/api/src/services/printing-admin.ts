import { appendSetTotal, fixTypography } from "@openrift/shared";
import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";

import type { Transact } from "../deps.js";
import { AppError, ERROR_CODES } from "../errors.js";
import type { Io } from "../io.js";
import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { distributionChannelsRepo } from "../repositories/distribution-channels.js";
import type { markersRepo } from "../repositories/markers.js";
import type { printingEventsRepo } from "../repositories/printing-events.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import { assertFound } from "../utils/assertions.js";
import { deleteRehostFiles } from "./image-rehost.js";
import { recordNewPrintingEvent } from "./record-printing-event.js";

type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;
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
    const printing = await trxRepos.candidateMutations.getPrintingById(printingId);
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
    candidateMutations: CandidateMutationsRepo;
    distributionChannels: DistributionChannelsRepo;
  },
  printingId: string,
  newSlugs: readonly string[],
): Promise<void> {
  const printing = await repos.candidateMutations.getPrintingById(printingId);
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
 * Delete a printing and clean up all related data.
 */
export async function deletePrinting(
  transact: Transact,
  io: Io,
  repos: { candidateMutations: CandidateMutationsRepo },
  printingId: string,
): Promise<void> {
  const mut = repos.candidateMutations;

  const printing = await mut.getPrintingById(printingId);
  assertFound(printing, "Printing not found");

  const deletedImageFileIds = await transact(async (trxRepos) => {
    const trxMut = trxRepos.candidateMutations;

    await trxMut.unlinkCandidatePrintingsByPrintingId(printing.id);
    const images = await trxMut.deletePrintingImagesByPrintingId(printing.id);
    await trxMut.deletePrintingLinkOverridesById(printing.id);
    await trxMut.deletePrintingById(printing.id);

    return images.map((img) => img.imageFileId);
  });

  for (const imageFileId of deletedImageFileIds) {
    const imageFile = await repos.candidateMutations.getImageFileById(imageFileId);
    if (!imageFile) {
      continue;
    }
    const stillReferenced = await repos.candidateMutations.isImageFileReferenced(imageFileId);
    if (!stillReferenced) {
      if (imageFile.rehostedUrl) {
        await deleteRehostFiles(io, imageFile.rehostedUrl);
      }
      await repos.candidateMutations.deleteImageFileById(imageFileId);
    }
  }
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
    candidateMutations: CandidateMutationsRepo;
    printingImages: PrintingImagesRepo;
    markers: MarkersRepo;
    distributionChannels: DistributionChannelsRepo;
    printingEvents?: PrintingEventsRepo;
  },
  cardId: string,
  printingFields: AcceptPrintingFields,
  candidatePrintingIds: string[],
): Promise<string> {
  if (!printingFields.setId) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "printingFields.setId is required");
  }

  const mut = repos.candidateMutations;

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

  const finish = (printingFields.finish ?? "normal") as Finish;
  const language = printingFields.language ?? "EN";
  const existing = await mut.getPrintingCardIdByComposite(
    printingFields.shortCode,
    finish,
    markerSlugs,
    language,
  );
  if (existing && existing.cardId !== cardId) {
    throw new AppError(
      409,
      "CONFLICT",
      `Printing "${printingFields.shortCode}:${finish}:${language}" already belongs to a different card`,
    );
  }

  const firstPs =
    candidatePrintingIds.length > 0
      ? await mut.getProviderNameForCandidatePrinting(candidatePrintingIds[0])
      : null;

  let insertedId = "";

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
      const setRow = await trxRepos.candidateMutations.getSetIdBySlug(printingFields.setId);
      setUuid = setRow?.id ?? "";
      if (setUuid) {
        const setTotalRow = await trxRepos.sets.getPrintedTotal(setUuid);
        setPrintedTotal = setTotalRow?.printedTotal ?? null;
      }
    }

    const rawRarity = String(printingFields.rarity || ("Common" satisfies Rarity));
    const rarityRows = await trxRepos.rarities.listAll();
    const raritySlugs = rarityRows.map((row) => row.slug);
    const normalizedRarity = raritySlugs.find(
      (slug) => slug.toLowerCase() === rawRarity.toLowerCase(),
    );
    if (!normalizedRarity) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Invalid rarity "${rawRarity}". Must be one of: ${raritySlugs.join(", ")}`,
      );
    }

    insertedId = await trxRepos.candidateMutations.upsertPrinting({
      cardId,
      setId: setUuid,
      shortCode: printingFields.shortCode,
      rarity: normalizedRarity as Rarity,
      artVariant: (printingFields.artVariant ?? "normal") as ArtVariant,
      isSigned: printingFields.isSigned ?? false,
      markerSlugs,
      finish,
      artist: printingFields.artist,
      publicCode: appendSetTotal(printingFields.publicCode, setPrintedTotal),
      printedRulesText: fixTypography(printingFields.printedRulesText ?? null),
      printedEffectText: fixTypography(printingFields.printedEffectText ?? null),
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

    await trxRepos.candidateMutations.recomputeKeywordsForPrintingCard(insertedId);

    if (printingFields.imageUrl) {
      await trxRepos.printingImages.insertImage(
        insertedId,
        printingFields.imageUrl,
        firstPs?.provider ?? "import",
      );
    }

    if (candidatePrintingIds.length > 0) {
      await trxRepos.candidateMutations.linkAndCheckCandidatePrintings(
        candidatePrintingIds,
        insertedId,
      );
    }
  });

  if (repos.printingEvents) {
    await recordNewPrintingEvent(repos.printingEvents, insertedId);
  }

  return insertedId;
}
