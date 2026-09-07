import { ERROR_CODES, WellKnown } from "@openrift/shared";

import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
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

interface SkippedGroup {
  shortCode: string;
  reason: string;
}

/** Skips groups where the printing identity already exists or required fields are missing. */
export async function acceptFavoritePrintingsForCard(
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
  cardSlug: string,
  favoriteProviders: Set<string>,
): Promise<{ printingsCreated: number; skipped: SkippedGroup[] }> {
  const mut = repos.catalogMutations;

  const card = await mut.getCardBySlug(cardSlug);
  if (!card) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card not found: ${cardSlug}`);
  }

  const aliases = await mut.getCardAliases(card.id);
  if (aliases.length === 0) {
    throw new AppError(500, ERROR_CODES.MISSING_ALIAS, `Card "${cardSlug}" has no name aliases`);
  }
  const normNames = aliases.map((a) => a.normName);
  const allCandidates = await repos.candidateCards.candidateCardsForDetail(normNames);

  const favoriteCandidates = allCandidates.filter((cc) => favoriteProviders.has(cc.provider));
  if (favoriteCandidates.length === 0) {
    return { printingsCreated: 0, skipped: [] };
  }

  const favCandidateIds = favoriteCandidates.map((cc) => cc.id);
  const allCandidatePrintings =
    await repos.candidateCards.allCandidatePrintingsForCandidateCards(favCandidateIds);
  const unlinkedPrintings = allCandidatePrintings.filter((cp) => !cp.printingId);

  if (unlinkedPrintings.length === 0) {
    return { printingsCreated: 0, skipped: [] };
  }

  const groupMap = new Map<string, typeof unlinkedPrintings>();
  for (const cp of unlinkedPrintings) {
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
  const skipped: SkippedGroup[] = [];

  for (const [, group] of groupMap) {
    const [first] = group;

    if (!first) {
      continue;
    }

    const label = first.shortCode || "(unknown)";

    const { shortCode, setId, rarity, finish } = first;
    const missingFields: string[] = [];
    if (!shortCode) {
      missingFields.push("shortCode");
    }
    if (!setId) {
      missingFields.push("setId");
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

    const existing = await mut.getPrintingCardIdByComposite(
      shortCode,
      finish,
      first.markerSlugs ?? [],
      first.language ?? WellKnown.language.EN,
    );
    if (existing) {
      skipped.push({ shortCode: label, reason: "printing already exists" });
      continue;
    }

    try {
      await acceptPrinting(
        transact,
        repos,
        card.id,
        {
          shortCode,
          setId,
          setName: first.setName,
          rarity,
          artVariant: first.artVariant ?? WellKnown.artVariant.NORMAL,
          isSigned: first.isSigned ?? false,
          isOvernumbered: first.isOvernumbered ?? false,
          markerSlugs: first.markerSlugs ?? [],
          distributionChannelSlugs: first.distributionChannelSlugs ?? [],
          finish,
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
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ shortCode: label, reason: message });
    }
  }

  for (const cc of favoriteCandidates) {
    await repos.candidateCards.checkCandidateCard(cc.id);
  }

  // Each acceptPrinting above fire-and-forget rehosts the image it inserted, so
  // there is no separate batch rehost step here.
  return { printingsCreated, skipped };
}
