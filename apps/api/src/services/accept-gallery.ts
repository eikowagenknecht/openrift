import type { CardType, Domain, SuperType } from "@openrift/shared/types";

import type { Transact } from "../deps.js";
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

/** Strip variant suffix from a short code — e.g. "OGN-001a" → "OGN-001"
 * @returns The short code with trailing letters/asterisks removed. */
function stripVariantSuffix(shortCode: string): string {
  return shortCode.replace(/(?<=\d)[a-z*]+$/, "");
}

/**
 * Accept a new card from gallery source data: create the card, create all
 * gallery printings, set images as main, and rehost them.
 *
 * @param normalizedName — the card's normalized name (used to find candidates)
 * @returns The new card slug, number of printings created, and rehost count.
 */
export async function acceptGalleryForNewCard(
  transact: Transact,
  io: Io,
  repos: {
    candidateCards: CandidateCardsRepo;
    candidateMutations: CandidateMutationsRepo;
    printingImages: PrintingImagesRepo;
    promoTypes: PromoTypesRepo;
  },
  normalizedName: string,
): Promise<{ cardSlug: string; printingsCreated: number; imagesRehosted: number }> {
  const mut = repos.candidateMutations;

  // 1. Find the gallery candidate card for this name
  const allCandidates = await repos.candidateCards.candidateCardsByNormNameAndProvider(
    normalizedName,
    "gallery",
  );

  if (allCandidates.length === 0) {
    throw new Error("No gallery source found for this card");
  }

  const galleryCard = allCandidates[0];

  // 2. Derive card slug and create the card
  const cardSlug = galleryCard.shortCode
    ? stripVariantSuffix(galleryCard.shortCode)
    : normalizedName;

  // Check for existing card with this slug (shouldn't exist for "new" rows, but be safe)
  const existing = await mut.getCardIdBySlug(cardSlug);
  // oxlint-disable-next-line unicorn/prefer-ternary -- both branches are async with different logic
  if (existing) {
    // Link the name alias to the existing card instead of creating a new one
    await transact(async (trxRepos) => {
      await trxRepos.candidateMutations.createNameAliases(normalizedName, existing.id);
    });
  } else {
    await transact(async (trxRepos) => {
      await trxRepos.candidateMutations.acceptNewCardFromSources(
        {
          id: cardSlug,
          name: galleryCard.name,
          type: galleryCard.type as CardType,
          superTypes: (galleryCard.superTypes ?? []) as SuperType[],
          domains: (galleryCard.domains ?? []) as Domain[],
          might: galleryCard.might,
          energy: galleryCard.energy,
          power: galleryCard.power,
          mightBonus: galleryCard.mightBonus,
          rulesText: galleryCard.rulesText,
          effectText: galleryCard.effectText,
          tags: galleryCard.tags ?? [],
        },
        normalizedName,
      );
    });
  }

  // 3. Find all gallery candidate printings for these candidate cards
  const galleryCandidateIds = allCandidates.map((cc) => cc.id);
  const candidatePrintings =
    await repos.candidateCards.allCandidatePrintingsForCandidateCards(galleryCandidateIds);

  // 4. Group by shortCode + finish + promoTypeId and create each printing
  const groupMap = new Map<string, typeof candidatePrintings>();
  for (const cp of candidatePrintings) {
    const key = `${cp.shortCode}|${cp.finish ?? ""}|${cp.promoTypeId ?? ""}`;
    let arr = groupMap.get(key);
    if (!arr) {
      arr = [];
      groupMap.set(key, arr);
    }
    arr.push(cp);
  }

  let printingsCreated = 0;
  let imagesInserted = 0;

  for (const [, group] of groupMap) {
    const first = group[0];

    if (!first.setId) {
      continue; // setId is required for printing creation
    }

    try {
      await acceptPrinting(
        transact,
        repos,
        cardSlug,
        {
          shortCode: first.shortCode,
          setId: first.setId,
          setName: first.setName,
          collectorNumber: first.collectorNumber ?? 0,
          rarity: first.rarity,
          artVariant: first.artVariant ?? "normal",
          isSigned: first.isSigned ?? false,
          promoTypeId: first.promoTypeId,
          finish: first.finish ?? "normal",
          artist: first.artist ?? "",
          publicCode: first.publicCode ?? "",
          printedRulesText: first.printedRulesText,
          printedEffectText: first.printedEffectText,
          flavorText: first.flavorText,
          imageUrl: first.imageUrl,
        },
        group.map((cp) => cp.id),
      );
      printingsCreated++;
      if (first.imageUrl) {
        imagesInserted++;
      }
    } catch {
      // Skip failed printing groups — partial success is acceptable
    }
  }

  // 5. Mark gallery candidates as checked
  for (const cc of allCandidates) {
    await mut.checkCandidateCard(cc.id);
  }

  // 6. Rehost newly inserted images
  let imagesRehosted = 0;
  if (imagesInserted > 0) {
    try {
      const result = await rehostImages(io, repos.printingImages, imagesInserted + 5);
      imagesRehosted = result.rehosted;
    } catch {
      // Rehost failure is non-fatal; images will be picked up by the next batch
    }
  }

  return { cardSlug, printingsCreated, imagesRehosted };
}
