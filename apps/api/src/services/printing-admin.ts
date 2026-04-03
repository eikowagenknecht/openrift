import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";
import { RARITY_ORDER } from "@openrift/shared/types";

import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { Io } from "../io.js";
import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import type { promoTypesRepo } from "../repositories/promo-types.js";
import { appendSetTotal, fixTypography } from "./fix-typography.js";
import { deleteRehostFiles } from "./image-rehost.js";

type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;
type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type PromoTypesRepo = ReturnType<typeof promoTypesRepo>;

// ── updatePrintingPromoType ──────────────────────────────────────────────────

/**
 * Update a printing's promoTypeId.
 * @returns Resolves when the printing has been updated.
 */
export async function updatePrintingPromoType(
  repos: {
    candidateMutations: CandidateMutationsRepo;
    promoTypes: PromoTypesRepo;
  },
  printingId: string,
  newPromoTypeId: string | null,
): Promise<void> {
  const printing = await repos.candidateMutations.getPrintingById(printingId);

  if (!printing) {
    throw new AppError(404, "NOT_FOUND", "Printing not found");
  }

  if (newPromoTypeId) {
    const pt = await repos.promoTypes.getById(newPromoTypeId);
    if (!pt) {
      throw new AppError(400, "BAD_REQUEST", "Invalid promoTypeId");
    }
  }

  await repos.candidateMutations.updatePrintingById(printing.id, {
    promoTypeId: newPromoTypeId,
  });
}

// ── deletePrinting ──────────────────────────────────────────────────────────

/**
 * Delete a printing and clean up all related data:
 * - Unlink candidate_printings (set printing_id to null)
 * - Delete printing_images rows
 * - Delete printing_link_overrides rows
 * - Delete the printing itself
 * - Clean up rehosted image files on disk
 *
 * Throws if the printing has user copies, wish-list items, or other
 * hard references (the DB FK constraints will reject the delete).
 */
export async function deletePrinting(
  transact: Transact,
  io: Io,
  repos: { candidateMutations: CandidateMutationsRepo },
  printingId: string,
): Promise<void> {
  const mut = repos.candidateMutations;

  // Validate outside the transaction
  const printing = await mut.getPrintingById(printingId);

  if (!printing) {
    throw new AppError(404, "NOT_FOUND", "Printing not found");
  }

  const deletedImages = await transact(async (trxRepos) => {
    const trxMut = trxRepos.candidateMutations;

    // Unlink candidate_printings so they become "unmatched" again
    await trxMut.unlinkCandidatePrintingsByPrintingId(printing.id);

    // Delete printing_images rows and collect rehostedUrls for disk cleanup
    const images = await trxMut.deletePrintingImagesByPrintingId(printing.id);

    // Delete link overrides
    await trxMut.deletePrintingLinkOverridesById(printing.id);

    // Delete the printing itself (will throw if FK-constrained by copies, etc.)
    await trxMut.deletePrintingById(printing.id);

    return images;
  });

  // Clean up rehosted files on disk (outside transaction, best-effort)
  for (const img of deletedImages) {
    if (img.rehostedUrl) {
      await deleteRehostFiles(io, img.rehostedUrl);
    }
  }
}

// ── acceptPrinting ───────────────────────────────────────────────────────────

interface AcceptPrintingFields {
  shortCode: string;
  setId?: string;
  setName?: string | null;
  collectorNumber: number;
  rarity?: string | null;
  artVariant?: string;
  isSigned?: boolean;
  promoTypeId?: string | null;
  finish?: string;
  artist: string;
  publicCode: string;
  printedRulesText?: string | null;
  printedEffectText?: string | null;
  flavorText?: string | null;
  imageUrl?: string | null;
  language?: string;
  printedName?: string | null;
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
    promoTypes: PromoTypesRepo;
  },
  cardSlug: string,
  printingFields: AcceptPrintingFields,
  candidatePrintingIds: string[],
): Promise<string> {
  if (candidatePrintingIds.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "printingFields and candidatePrintingIds[] required");
  }
  if (!printingFields.setId) {
    throw new AppError(400, "BAD_REQUEST", "printingFields.setId is required");
  }

  const mut = repos.candidateMutations;

  const card = await mut.getCardIdBySlug(cardSlug);
  if (!card) {
    throw new AppError(404, "NOT_FOUND", "Card not found");
  }

  if (printingFields.promoTypeId) {
    const pt = await repos.promoTypes.getById(printingFields.promoTypeId);
    if (!pt) {
      throw new AppError(400, "BAD_REQUEST", "Invalid promoTypeId");
    }
  }

  const finish = (printingFields.finish ?? "normal") as Finish;

  // Guard: reject if this identity already belongs to a different card
  const existing = await mut.getPrintingCardIdByComposite(
    printingFields.shortCode,
    finish,
    printingFields.promoTypeId ?? null,
  );
  if (existing && existing.cardId !== card.id) {
    throw new AppError(
      409,
      "CONFLICT",
      `Printing "${printingFields.shortCode}:${finish}" already belongs to a different card`,
    );
  }

  const firstPs = await mut.getProviderNameForCandidatePrinting(candidatePrintingIds[0]);

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
    const normalizedRarity = RARITY_ORDER.find((r) => r.toLowerCase() === rawRarity.toLowerCase());
    if (!normalizedRarity) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Invalid rarity "${rawRarity}". Must be one of: ${RARITY_ORDER.join(", ")}`,
      );
    }

    insertedId = await trxRepos.candidateMutations.upsertPrinting({
      cardId: card.id,
      setId: setUuid,
      shortCode: printingFields.shortCode,
      collectorNumber: printingFields.collectorNumber,
      rarity: normalizedRarity as Rarity,
      artVariant: (printingFields.artVariant ?? "normal") as ArtVariant,
      isSigned: printingFields.isSigned ?? false,
      promoTypeId: printingFields.promoTypeId ?? null,
      finish,
      artist: printingFields.artist,
      publicCode: appendSetTotal(printingFields.publicCode, setPrintedTotal),
      printedRulesText: fixTypography(printingFields.printedRulesText ?? null),
      printedEffectText: fixTypography(printingFields.printedEffectText ?? null),
      flavorText: fixTypography(printingFields.flavorText ?? null, {
        italicParens: false,
        keywordGlyphs: false,
      }),
      language: printingFields.language ?? "EN",
      printedName: printingFields.printedName ?? null,
    });

    // Recompute card-level keywords from all printing texts
    await trxRepos.candidateMutations.recomputeKeywordsForPrintingCard(insertedId);

    if (printingFields.imageUrl) {
      await trxRepos.printingImages.insertImage(
        insertedId,
        printingFields.imageUrl,
        firstPs?.provider ?? "import",
      );
    }

    await trxRepos.candidateMutations.linkAndCheckCandidatePrintings(
      candidatePrintingIds,
      insertedId,
    );
  });

  return insertedId;
}
