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
 * Accept a new card from favorite-provider candidate data: create the card,
 * create all printings from favorite providers, set images, and rehost them.
 *
 * @param normalizedName — the card's normalized name (used to find candidates)
 * @param favoriteProviders — set of provider slugs marked as favorites
 * @returns The new card slug and number of printings created.
 */
export async function acceptFavoriteNewCard(
  transact: Transact,
  io: Io,
  repos: {
    candidateCards: CandidateCardsRepo;
    candidateMutations: CandidateMutationsRepo;
    printingImages: PrintingImagesRepo;
    promoTypes: PromoTypesRepo;
  },
  normalizedName: string,
  favoriteProviders: Set<string>,
): Promise<{ cardSlug: string; printingsCreated: number }> {
  const mut = repos.candidateMutations;

  // 1. Find candidate cards for this name, filtered to favorite providers
  const allCandidates = await repos.candidateCards.candidateCardsByNormName(normalizedName);
  const favoriteCandidates = allCandidates.filter((cc) => favoriteProviders.has(cc.provider));

  if (favoriteCandidates.length === 0) {
    throw new Error("No favorite-provider source found for this card");
  }

  const primaryCandidate = favoriteCandidates[0];

  // 2. Derive card slug and create the card
  const cardSlug = primaryCandidate.shortCode
    ? stripVariantSuffix(primaryCandidate.shortCode)
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
          name: primaryCandidate.name,
          type: primaryCandidate.type as CardType,
          superTypes: (primaryCandidate.superTypes ?? []) as SuperType[],
          domains: (primaryCandidate.domains ?? []) as Domain[],
          might: primaryCandidate.might,
          energy: primaryCandidate.energy,
          power: primaryCandidate.power,
          mightBonus: primaryCandidate.mightBonus,
          tags: primaryCandidate.tags ?? [],
        },
        normalizedName,
      );
    });
  }

  // 3. Find all candidate printings for favorite candidates
  const favCandidateIds = favoriteCandidates.map((cc) => cc.id);
  const candidatePrintings =
    await repos.candidateCards.allCandidatePrintingsForCandidateCards(favCandidateIds);

  // 4. Group by shortCode + finish + promoTypeId + language and create each printing
  const groupMap = new Map<string, typeof candidatePrintings>();
  for (const cp of candidatePrintings) {
    const key = `${cp.shortCode}|${cp.finish ?? ""}|${cp.promoTypeId ?? ""}|${cp.language ?? "EN"}`;
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
          language: first.language ?? "EN",
          printedName: first.printedName,
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

  // 5. Mark favorite candidates as checked
  for (const cc of favoriteCandidates) {
    await mut.checkCandidateCard(cc.id);
  }

  // 6. Rehost newly inserted images (fire-and-forget to avoid blocking the response
  //    with slow external image downloads)
  if (imagesInserted > 0) {
    // oxlint-disable-next-line promise/prefer-await-to-then -- intentionally fire-and-forget to avoid blocking the response
    rehostImages(io, repos.printingImages, imagesInserted + 5).catch(() => {
      // Non-fatal; unrehosted images fall back to the external URL and will be
      // picked up by the next rehost batch.
    });
  }

  return { cardSlug, printingsCreated };
}
