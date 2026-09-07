import type { CardType, Domain, SuperType } from "@openrift/shared/types/enums";
import { slugifyName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

import type { Transact } from "../deps.js";
import type { Io } from "../io.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type { catalogMutationsRepo } from "../repositories/catalog-mutations.js";
import type { distributionChannelsRepo } from "../repositories/distribution-channels.js";
import type { markersRepo } from "../repositories/markers.js";
import type { printingEventsRepo } from "../repositories/printing-events.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";
import { acceptPrinting } from "./printing-admin.js";

type CandidateCardsRepo = ReturnType<typeof candidateCardsRepo>;
type CatalogMutationsRepo = ReturnType<typeof catalogMutationsRepo>;
type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;
type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type MarkersRepo = ReturnType<typeof markersRepo>;
type DistributionChannelsRepo = ReturnType<typeof distributionChannelsRepo>;

export async function acceptFavoriteNewCard(
  transact: Transact,
  io: Io,
  repos: {
    candidateCards: CandidateCardsRepo;
    catalogMutations: CatalogMutationsRepo;
    printingImages: PrintingImagesRepo;
    markers: MarkersRepo;
    distributionChannels: DistributionChannelsRepo;
    printingEvents?: PrintingEventsRepo;
  },
  normalizedName: string,
  favoriteProviders: Set<string>,
): Promise<{
  cardSlug: string;
  printingsCreated: number;
  skipped: { shortCode: string; reason: string }[];
}> {
  const mut = repos.catalogMutations;

  const allCandidates = await repos.candidateCards.candidateCardsByNormName(normalizedName);
  const favoriteCandidates = allCandidates.filter((cc) => favoriteProviders.has(cc.provider));

  const [primaryCandidate] = favoriteCandidates;

  if (!primaryCandidate) {
    throw new Error("No favorite-provider source found for this card");
  }

  const cardSlug = slugifyName(primaryCandidate.name);

  const existing = await mut.getCardIdBySlug(cardSlug);
  // oxlint-disable-next-line unicorn/prefer-ternary -- both branches are async with different logic
  if (existing) {
    await transact(async (trxRepos) => {
      await trxRepos.catalogMutations.createNameAliases(normalizedName, existing.id);
    });
  } else {
    await transact(async (trxRepos) => {
      await trxRepos.catalogMutations.acceptNewCardFromSources(
        {
          id: cardSlug,
          name: primaryCandidate.name,
          types: primaryCandidate.types as CardType[],
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

  const favCandidateIds = favoriteCandidates.map((cc) => cc.id);
  const candidatePrintings =
    await repos.candidateCards.allCandidatePrintingsForCandidateCards(favCandidateIds);

  const groupMap = new Map<string, typeof candidatePrintings>();
  for (const cp of candidatePrintings) {
    const slugKey = [...(cp.markerSlugs ?? [])].sort().join(",");
    const key = `${cp.shortCode}|${cp.finish ?? ""}|${slugKey}|${cp.language ?? WellKnown.language.EN}`;
    let arr = groupMap.get(key);
    if (!arr) {
      arr = [];
      groupMap.set(key, arr);
    }
    arr.push(cp);
  }

  let printingsCreated = 0;
  const skipped: { shortCode: string; reason: string }[] = [];

  for (const [, group] of groupMap) {
    const [first] = group;

    if (!first) {
      continue;
    }

    if (!first.setId) {
      skipped.push({ shortCode: first.shortCode, reason: "missing setId" });
      continue;
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
          artVariant: first.artVariant ?? WellKnown.artVariant.NORMAL,
          isSigned: first.isSigned ?? false,
          isOvernumbered: first.isOvernumbered ?? false,
          markerSlugs: first.markerSlugs ?? [],
          distributionChannelSlugs: first.distributionChannelSlugs ?? [],
          finish: first.finish ?? WellKnown.finish.NORMAL,
          size: first.size ?? WellKnown.cardSize.STANDARD,
          artist: first.artist ?? "",
          publicCode: first.publicCode ?? "",
          printedRulesText: first.printedRulesText,
          printedEffectText: first.printedEffectText,
          flavorText: first.flavorText,
          imageUrl: first.imageUrl,
          language: first.language ?? WellKnown.language.EN,
          printedName: first.printedName,
          printedYear: first.printedYear,
        },
        group.map((cp) => cp.id),
        io,
      );
      printingsCreated++;
    } catch (error) {
      // A skipped group is recorded, not dropped, so a failing provider is visible.
      skipped.push({
        shortCode: first.shortCode,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const cc of favoriteCandidates) {
    await repos.candidateCards.checkCandidateCard(cc.id);
  }

  // acceptPrinting above fire-and-forget rehosts each inserted image; no separate batch rehost step.
  return { cardSlug, printingsCreated, skipped };
}
