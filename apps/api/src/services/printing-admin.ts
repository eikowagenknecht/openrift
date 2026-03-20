import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";
import { RARITY_ORDER } from "@openrift/shared/types";
import { buildPrintingId } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { AppError } from "../errors.js";
import type { Io } from "../io.js";
import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import type { promoTypesRepo } from "../repositories/promo-types.js";
import { setsRepo } from "../repositories/sets.js";
import { renamePrintingImages } from "./image-rehost.js";

type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;
type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type PromoTypesRepo = ReturnType<typeof promoTypesRepo>;

// ── updatePrintingPromoType ──────────────────────────────────────────────────

/**
 * Update a printing's promoTypeId, rebuild its slug, and rename rehosted images.
 * @returns Resolves when the printing and its images have been updated.
 */
export async function updatePrintingPromoType(
  db: Kysely<Database>,
  io: Io,
  repos: {
    printingImages: PrintingImagesRepo;
    promoTypes: PromoTypesRepo;
  },
  printingSlug: string,
  newPromoTypeId: string | null,
): Promise<void> {
  const printing = await db
    .selectFrom("printings as p")
    .innerJoin("sets as s", "s.id", "p.setId")
    .select(["p.id", "p.slug", "p.shortCode", "p.rarity", "p.finish", "s.slug as setSlug"])
    .where("p.slug", "=", printingSlug)
    .executeTakeFirst();

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

  const newSlug = buildPrintingId(
    printing.shortCode,
    printing.rarity,
    promoTypeSlug,
    printing.finish,
  );

  await db
    .updateTable("printings")
    .set({
      promoTypeId: newPromoTypeId,
      slug: newSlug,
    })
    .where("id", "=", printing.id)
    .execute();

  await renamePrintingImages(io, repos.printingImages, printing.id, printing.slug, newSlug);
}

// ── renamePrinting ───────────────────────────────────────────────────────────

/**
 * Rename a printing's slug and update all rehosted image file paths.
 * @returns Resolves when the slug and images have been renamed.
 */
export async function renamePrinting(
  io: Io,
  repos: {
    candidateMutations: CandidateMutationsRepo;
    printingImages: PrintingImagesRepo;
  },
  printingSlug: string,
  newSlug: string,
): Promise<void> {
  const printing = await repos.printingImages.getPrintingIdBySlug(printingSlug);
  if (!printing) {
    throw new AppError(404, "NOT_FOUND", "Printing not found");
  }

  await repos.candidateMutations.renamePrintingSlug(printingSlug, newSlug);
  await renamePrintingImages(io, repos.printingImages, printing.id, printingSlug, newSlug);
}

// ── acceptPrinting ───────────────────────────────────────────────────────────

interface AcceptPrintingFields {
  id?: string;
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
  db: Kysely<Database>,
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

  const printingId =
    printingFields.id ||
    buildPrintingId(
      printingFields.shortCode,
      printingFields.rarity ?? ("Common" satisfies Rarity),
      promoTypeSlug,
      printingFields.finish ?? ("normal" satisfies Finish),
    );

  const firstPs = await mut.getProviderNameForCandidatePrinting(candidatePrintingIds[0]);

  await db.transaction().execute(async (trx) => {
    if (printingFields.setId) {
      await setsRepo(trx).upsert(
        printingFields.setId,
        printingFields.setName ?? printingFields.setId,
        trx,
      );
    }

    let setUuid = "";
    if (printingFields.setId) {
      const setRow = await mut.getSetIdBySlug(printingFields.setId, trx);
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

    const insertedId = await mut.upsertPrinting(trx, {
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
      printedRulesText: printingFields.printedRulesText ?? null,
      printedEffectText: printingFields.printedEffectText ?? null,
      flavorText: printingFields.flavorText ?? null,
    });

    if (printingFields.imageUrl) {
      await repos.printingImages.insertImage(
        trx,
        insertedId,
        printingFields.imageUrl,
        firstPs?.provider ?? "import",
      );
    }

    await mut.linkAndCheckCandidatePrintings(candidatePrintingIds, insertedId, trx);
  });

  return printingId;
}
