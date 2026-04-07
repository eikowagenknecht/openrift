import type { Transact } from "../deps.js";
import { AppError, ERROR_CODES } from "../errors.js";
import type { Io } from "../io.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import type { promoTypesRepo } from "../repositories/promo-types.js";
import { rehostImages } from "./image-rehost.js";
import { acceptPrinting } from "./printing-admin.js";

type CandidateCardsRepo = ReturnType<typeof candidateCardsRepo>;
type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;
type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type PromoTypesRepo = ReturnType<typeof promoTypesRepo>;

interface SkippedGroup {
  shortCode: string;
  reason: string;
}

/**
 * Accept all unlinked candidate printings from favorite providers for an existing card.
 * Creates new printings only — skips groups where the printing identity already exists.
 * Fails early on missing required fields instead of falling back to defaults.
 *
 * @returns Summary of created and skipped printing groups.
 */
export async function acceptFavoritePrintingsForCard(
  transact: Transact,
  io: Io,
  repos: {
    candidateCards: CandidateCardsRepo;
    candidateMutations: CandidateMutationsRepo;
    printingImages: PrintingImagesRepo;
    promoTypes: PromoTypesRepo;
  },
  cardSlug: string,
  favoriteProviders: Set<string>,
): Promise<{ printingsCreated: number; imagesRehosted: number; skipped: SkippedGroup[] }> {
  const mut = repos.candidateMutations;

  // 1. Resolve card
  const card = await mut.getCardById(cardSlug);
  if (!card) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card not found: ${cardSlug}`);
  }

  // 2. Find all candidate cards for this card (via name aliases)
  const aliases = await mut.getCardAliases(card.id);
  if (aliases.length === 0) {
    throw new AppError(500, "MISSING_ALIAS", `Card "${cardSlug}" has no name aliases`);
  }
  const normNames = aliases.map((a) => a.normName);
  const allCandidates = await repos.candidateCards.candidateCardsForDetail(normNames);

  // 3. Filter to favorite providers only
  const favoriteCandidates = allCandidates.filter((cc) => favoriteProviders.has(cc.provider));
  if (favoriteCandidates.length === 0) {
    return { printingsCreated: 0, imagesRehosted: 0, skipped: [] };
  }

  // 4. Get their candidate printings, filter to unlinked only
  const favCandidateIds = favoriteCandidates.map((cc) => cc.id);
  const allCandidatePrintings =
    await repos.candidateCards.allCandidatePrintingsForCandidateCards(favCandidateIds);
  const unlinkedPrintings = allCandidatePrintings.filter((cp) => !cp.printingId);

  if (unlinkedPrintings.length === 0) {
    return { printingsCreated: 0, imagesRehosted: 0, skipped: [] };
  }

  // 5. Group by shortCode|finish|promoTypeId|language
  const groupMap = new Map<string, typeof unlinkedPrintings>();
  for (const cp of unlinkedPrintings) {
    const key = `${cp.shortCode}|${cp.finish ?? ""}|${cp.promoTypeId ?? ""}|${cp.language ?? "EN"}`;
    let arr = groupMap.get(key);
    if (!arr) {
      arr = [];
      groupMap.set(key, arr);
    }
    arr.push(cp);
  }

  // 6. Process each group
  let printingsCreated = 0;
  let imagesInserted = 0;
  const skipped: SkippedGroup[] = [];

  for (const [, group] of groupMap) {
    const first = group[0];
    const label = first.shortCode || "(unknown)";

    // Validate required fields — fail early instead of defaulting to wrong values
    const { shortCode, setId, collectorNumber, rarity, finish } = first;
    const missingFields: string[] = [];
    if (!shortCode) {
      missingFields.push("shortCode");
    }
    if (!setId) {
      missingFields.push("setId");
    }
    if (collectorNumber === null || collectorNumber === undefined) {
      missingFields.push("collectorNumber");
    }
    if (!rarity) {
      missingFields.push("rarity");
    }
    if (!finish) {
      missingFields.push("finish");
    }

    if (missingFields.length > 0 || !shortCode || !setId || !rarity || !finish) {
      skipped.push({ shortCode: label, reason: `missing: ${missingFields.join(", ")}` });
      continue;
    }

    // Narrowed: shortCode, setId, rarity, finish are all non-null strings;
    // collectorNumber is a number (validated above)
    const validCollectorNumber = collectorNumber ?? 0;

    // Check if printing with this identity already exists
    const existing = await mut.getPrintingCardIdByComposite(
      shortCode,
      finish,
      first.promoTypeId ?? null,
    );
    if (existing) {
      skipped.push({ shortCode: label, reason: "printing already exists" });
      continue;
    }

    try {
      await acceptPrinting(
        transact,
        repos,
        cardSlug,
        {
          shortCode,
          setId,
          setName: first.setName,
          collectorNumber: validCollectorNumber,
          rarity,
          artVariant: first.artVariant ?? "normal",
          isSigned: first.isSigned ?? false,
          promoTypeId: first.promoTypeId,
          finish,
          artist: first.artist ?? "",
          publicCode: first.publicCode ?? "",
          printedRulesText: first.printedRulesText,
          printedEffectText: first.printedEffectText,
          flavorText: first.flavorText,
          imageUrl: first.imageUrl,
          language: first.language ?? "EN",
          printedName: first.printedName,
        },
        group.map((cp) => cp.id),
      );
      printingsCreated++;
      if (first.imageUrl) {
        imagesInserted++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ shortCode: label, reason: message });
    }
  }

  // 7. Mark favorite candidate cards as checked
  for (const cc of favoriteCandidates) {
    await mut.checkCandidateCard(cc.id);
  }

  // 8. Rehost newly inserted images
  let imagesRehosted = 0;
  if (imagesInserted > 0) {
    try {
      const result = await rehostImages(io, repos.printingImages, imagesInserted + 5);
      imagesRehosted = result.rehosted;
    } catch {
      // Rehost failure is non-fatal; images will be picked up by the next batch
    }
  }

  return { printingsCreated, imagesRehosted, skipped };
}
