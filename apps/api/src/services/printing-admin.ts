import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";
import { RARITY_ORDER } from "@openrift/shared/types";
import { buildPrintingId } from "@openrift/shared/utils";

import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { Io } from "../io.js";
import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import type { promoTypesRepo } from "../repositories/promo-types.js";
import { fixTypography } from "./fix-typography.js";
import { deleteRehostFiles } from "./image-rehost.js";

type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;
type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type PromoTypesRepo = ReturnType<typeof promoTypesRepo>;

// ── updatePrintingPromoType ──────────────────────────────────────────────────

/**
 * Update a printing's promoTypeId and rebuild its slug.
 * @returns Resolves when the printing has been updated.
 */
export async function updatePrintingPromoType(
  repos: {
    candidateMutations: CandidateMutationsRepo;
    promoTypes: PromoTypesRepo;
  },
  printingSlug: string,
  newPromoTypeId: string | null,
): Promise<void> {
  const printing = await repos.candidateMutations.getPrintingFieldsBySlug(printingSlug);

  if (!printing) {
    throw new AppError(404, "NOT_FOUND", "Printing not found");
  }

  let promoTypeSlug: string | null = null;
  if (newPromoTypeId) {
    const pt = await repos.promoTypes.getById(newPromoTypeId);
    if (!pt) {
      throw new AppError(400, "BAD_REQUEST", "Invalid promoTypeId");
    }
    promoTypeSlug = pt.slug;
  }

  const newSlug = buildPrintingId(printing.shortCode, promoTypeSlug, printing.finish);

  await repos.candidateMutations.updatePrintingById(printing.id, {
    promoTypeId: newPromoTypeId,
    slug: newSlug,
  });
}

// ── renamePrinting ───────────────────────────────────────────────────────────

/**
 * Rename a printing's slug.
 * @returns Resolves when the slug has been renamed.
 */
export async function renamePrinting(
  repos: {
    candidateMutations: CandidateMutationsRepo;
  },
  printingSlug: string,
  newSlug: string,
): Promise<void> {
  await repos.candidateMutations.renamePrintingSlug(printingSlug, newSlug);
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
  printingSlug: string,
): Promise<void> {
  const mut = repos.candidateMutations;

  // Validate outside the transaction
  const printing = await mut.getPrintingFieldsBySlug(printingSlug);

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
    await trxMut.deletePrintingLinkOverridesBySlug(printingSlug);

    // Delete the printing itself (will throw if FK-constrained by copies, etc.)
    await trxMut.deletePrintingBySlug(printingSlug);

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
}

/**
 * Create a new printing from admin-selected fields and link all sources in the group.
 * @returns The generated or provided printing ID (slug).
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

  let promoTypeSlug: string | null = null;
  if (printingFields.promoTypeId) {
    const pt = await repos.promoTypes.getById(printingFields.promoTypeId);
    if (!pt) {
      throw new AppError(400, "BAD_REQUEST", "Invalid promoTypeId");
    }
    promoTypeSlug = pt.slug;
  }

  const printingId = buildPrintingId(
    printingFields.shortCode,
    promoTypeSlug,
    printingFields.finish ?? ("normal" satisfies Finish),
  );

  // Guard: reject if this slug already belongs to a different card
  const existing = await mut.getPrintingCardIdBySlug(printingId);
  if (existing && existing.cardId !== card.id) {
    throw new AppError(
      409,
      "CONFLICT",
      `Printing slug "${printingId}" already belongs to a different card`,
    );
  }

  const firstPs = await mut.getProviderNameForCandidatePrinting(candidatePrintingIds[0]);

  await transact(async (trxRepos) => {
    if (printingFields.setId) {
      await trxRepos.sets.upsert(
        printingFields.setId,
        printingFields.setName ?? printingFields.setId,
      );
    }

    let setUuid = "";
    if (printingFields.setId) {
      const setRow = await trxRepos.candidateMutations.getSetIdBySlug(printingFields.setId);
      setUuid = setRow?.id ?? "";
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

    const insertedId = await trxRepos.candidateMutations.upsertPrinting({
      slug: printingId,
      cardId: card.id,
      setId: setUuid,
      shortCode: printingFields.shortCode,
      collectorNumber: printingFields.collectorNumber,
      rarity: normalizedRarity as Rarity,
      artVariant: (printingFields.artVariant ?? "normal") as ArtVariant,
      isSigned: printingFields.isSigned ?? false,
      promoTypeId: printingFields.promoTypeId ?? null,
      finish: (printingFields.finish ?? "normal") as Finish,
      artist: printingFields.artist,
      publicCode: printingFields.publicCode,
      printedRulesText: fixTypography(printingFields.printedRulesText ?? null),
      printedEffectText: fixTypography(printingFields.printedEffectText ?? null),
      flavorText: fixTypography(printingFields.flavorText ?? null, {
        italicParens: false,
        keywordGlyphs: false,
      }),
    });

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

  return printingId;
}
