import type {
  Card,
  CardType,
  CopyResponse,
  Domain,
  Printing,
  Rarity,
  VariantLabelPrinting,
} from "@openrift/shared";
import { WellKnown, compareCardDisplayName, isCountedZone } from "@openrift/shared";

import { frontImageId } from "@/lib/card-meta";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";

export interface DeckBoxCard {
  cardId: string;
  name: string;
  types: CardType[];
  tags: string[];
  domains: Domain[];
}

export interface DeckBoxCopy extends VariantLabelPrinting {
  copyId: string;
  printingId: string;
  shortCode: string;
  rarity: Rarity;
  imageId: string | null;
  condition: string | null;
  grade: number | null;
  collectionId: string;
  collectionName: string;
}

type DeckBoxSlotState = "in-box" | "available" | "blocked" | "missing";

interface DeckBoxAlternative {
  key: string;
  copy: DeckBoxCopy;
  count: number;
}

export interface DeckBoxSlot {
  key: string;
  cardId: string;
  cardKey: string;
  state: DeckBoxSlotState;
  copy?: DeckBoxCopy;
  alternatives: DeckBoxAlternative[];
  reason?: "loan" | "trade";
}

type SlotFill = Omit<DeckBoxSlot, "key" | "cardId" | "cardKey">;

interface DeckBoxExtra {
  card: DeckBoxCard;
  copies: DeckBoxCopy[];
}

export interface DeckBoxPlan {
  neededTotal: number;
  inBoxTotal: number;
  slots: DeckBoxSlot[];
  missingCount: number;
  extras: DeckBoxExtra[];
  extraCount: number;
  siblingPrintingsByCardId: ReadonlyMap<string, VariantLabelPrinting[]>;
}

export interface DeckBoxInput {
  cards: readonly DeckBuilderCard[];
  copies: readonly CopyResponse[];
  homeCollectionId: string;
  printingsByCardId: ReadonlyMap<string, Printing[]>;
  printingsById: Readonly<Record<string, Printing>>;
  collectionNameById: ReadonlyMap<string, string>;
  otherDeckNeeds?: ReadonlyMap<string, number>;
  languageOrder: readonly string[];
  conditionOrder: readonly string[];
  pinnedCopyIds?: ReadonlySet<string>;
}

const FINISH_ORDER: readonly string[] = [
  WellKnown.finish.NORMAL,
  WellKnown.finish.FOIL,
  WellKnown.finish.METAL,
  WellKnown.finish.METAL_DELUXE,
];

function candidateComparator(
  pinnedPrintingId: string | null,
  printingById: ReadonlyMap<string, Printing>,
  languageOrder: readonly string[],
  conditionOrder: readonly string[],
): (a: CopyResponse, b: CopyResponse) => number {
  const neutralCondition = (conditionOrder.length - 1) / 2;
  const conditionScore = (condition: string | null): number => {
    if (condition === null) {
      return neutralCondition;
    }
    const index = conditionOrder.indexOf(condition);
    return index === -1 ? neutralCondition : index;
  };
  const languageScore = (printingId: string): number => {
    const language = printingById.get(printingId)?.language;
    const index = language === undefined ? -1 : languageOrder.indexOf(language);
    return index === -1 ? languageOrder.length : index;
  };
  const finishScore = (printingId: string): number => {
    const finish = printingById.get(printingId)?.finish;
    const index = finish === undefined ? -1 : FINISH_ORDER.indexOf(finish);
    return index === -1 ? FINISH_ORDER.length : index;
  };

  return (a, b) => {
    const pinned =
      Number(b.printingId === pinnedPrintingId) - Number(a.printingId === pinnedPrintingId);
    if (pinned !== 0) {
      return pinned;
    }
    const language = languageScore(a.printingId) - languageScore(b.printingId);
    if (language !== 0) {
      return language;
    }
    const graded = Number(a.grade !== null) - Number(b.grade !== null);
    if (graded !== 0) {
      return graded;
    }
    const finish = finishScore(a.printingId) - finishScore(b.printingId);
    if (finish !== 0) {
      return finish;
    }
    // Reversed on purpose: prefers the more worn copy over the least worn.
    const condition = conditionScore(b.condition) - conditionScore(a.condition);
    if (condition !== 0) {
      return condition;
    }
    return a.id.localeCompare(b.id);
  };
}

function boxOrder(
  copies: readonly CopyResponse[],
  comparator: (a: CopyResponse, b: CopyResponse) => number,
  pinnedCopyIds?: ReadonlySet<string>,
): CopyResponse[] {
  const ranked = copies.toSorted(comparator);
  if (pinnedCopyIds === undefined || pinnedCopyIds.size === 0) {
    return ranked;
  }
  return [
    ...ranked.filter((copy) => pinnedCopyIds.has(copy.id)),
    ...ranked.filter((copy) => !pinnedCopyIds.has(copy.id)),
  ];
}

function alternativeKey(copy: CopyResponse): string {
  return [copy.printingId, copy.collectionId, copy.condition ?? "", copy.grade ?? ""].join("|");
}

function groupAlternatives(
  ranked: readonly CopyResponse[],
  asBoxCopy: (copy: CopyResponse) => DeckBoxCopy | undefined,
): DeckBoxAlternative[] {
  const byKey = new Map<string, DeckBoxAlternative>();
  for (const copy of ranked) {
    const key = alternativeKey(copy);
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
      continue;
    }
    const boxCopy = asBoxCopy(copy);
    if (boxCopy) {
      byKey.set(key, { key, copy: boxCopy, count: 1 });
    }
  }
  return [...byKey.values()];
}

function toBoxCopy(
  copy: CopyResponse,
  printing: Printing,
  collectionNameById: ReadonlyMap<string, string>,
): DeckBoxCopy {
  return {
    copyId: copy.id,
    printingId: copy.printingId,
    shortCode: printing.shortCode,
    rarity: printing.rarity,
    imageId: frontImageId(printing),
    language: printing.language,
    artVariant: printing.artVariant,
    finish: printing.finish,
    size: printing.size,
    isSigned: printing.isSigned,
    isOvernumbered: printing.isOvernumbered,
    markers: printing.markers,
    condition: copy.condition,
    grade: copy.grade,
    collectionId: copy.collectionId,
    collectionName: collectionNameById.get(copy.collectionId) ?? "",
  };
}

export function toBoxCardFromDeck(card: DeckBuilderCard): DeckBoxCard {
  return {
    cardId: card.cardId,
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
    domains: card.domains,
  };
}

function toBoxCardFromCatalog(cardId: string, card: Card): DeckBoxCard {
  return {
    cardId,
    name: card.name,
    types: card.types,
    tags: card.tags,
    domains: card.domains,
  };
}

/**
 * A copy in the box but on loan or reserved for a trade counts as blocked,
 * not settled.
 */
export function computeDeckBoxPlan({
  cards,
  copies,
  homeCollectionId,
  printingsByCardId,
  printingsById,
  collectionNameById,
  otherDeckNeeds,
  languageOrder,
  conditionOrder,
  pinnedCopyIds,
}: DeckBoxInput): DeckBoxPlan {
  const printingById = new Map<string, Printing>();
  const needsByCard = new Map<string, { card: DeckBoxCard; needed: number }>();
  const pinnedByCard = new Map<string, string | null>();
  for (const card of cards) {
    if (!isCountedZone(card.zone)) {
      continue;
    }
    const need = needsByCard.get(card.cardId);
    if (need) {
      need.needed += card.quantity;
    } else {
      needsByCard.set(card.cardId, { card: toBoxCardFromDeck(card), needed: card.quantity });
    }
    if (!pinnedByCard.has(card.cardId)) {
      pinnedByCard.set(card.cardId, card.preferredPrintingId);
    }
    for (const printing of printingsByCardId.get(card.cardId) ?? []) {
      printingById.set(printing.id, printing);
    }
  }

  const inBoxByCard = new Map<string, CopyResponse[]>();
  const blockedByCard = new Map<string, { loan: CopyResponse[]; trade: CopyResponse[] }>();
  const candidatesByCard = new Map<string, CopyResponse[]>();
  const siblingsByCard = new Map<string, Map<string, Printing>>();
  const noteSibling = (cardId: string, copy: CopyResponse) => {
    const printing = printingById.get(copy.printingId) ?? printingsById[copy.printingId];
    if (printing === undefined) {
      return;
    }
    const seen = siblingsByCard.get(cardId);
    if (seen) {
      seen.set(printing.id, printing);
    } else {
      siblingsByCard.set(cardId, new Map([[printing.id, printing]]));
    }
  };
  for (const copy of copies) {
    const deckPrinting = printingById.get(copy.printingId);
    const isDeckCard = deckPrinting !== undefined && needsByCard.has(deckPrinting.cardId);
    if (isDeckCard && (copy.onLoan || copy.reserved)) {
      const bucket = blockedByCard.get(deckPrinting.cardId) ?? { loan: [], trade: [] };
      if (copy.onLoan) {
        bucket.loan.push(copy);
      } else {
        bucket.trade.push(copy);
      }
      blockedByCard.set(deckPrinting.cardId, bucket);
      noteSibling(deckPrinting.cardId, copy);
      continue;
    }
    if (copy.collectionId === homeCollectionId) {
      if (copy.onLoan || copy.reserved) {
        continue;
      }
      const cardId = printingsById[copy.printingId]?.cardId;
      if (cardId === undefined) {
        continue;
      }
      const bucket = inBoxByCard.get(cardId);
      if (bucket) {
        bucket.push(copy);
      } else {
        inBoxByCard.set(cardId, [copy]);
      }
      noteSibling(cardId, copy);
      continue;
    }
    if (!isDeckCard) {
      continue;
    }
    // A group binder's copies belong to the group, so moving one into a
    // personal box would take it from everybody.
    if (copy.groupId !== null) {
      continue;
    }
    const bucket = candidatesByCard.get(deckPrinting.cardId);
    if (bucket) {
      bucket.push(copy);
    } else {
      candidatesByCard.set(deckPrinting.cardId, [copy]);
    }
    noteSibling(deckPrinting.cardId, copy);
  }

  const fillsByCard = new Map<string, SlotFill[]>();
  let neededTotal = 0;
  let inBoxTotal = 0;
  let missingCount = 0;

  for (const [cardId, { needed }] of needsByCard) {
    const comparator = candidateComparator(
      pinnedByCard.get(cardId) ?? null,
      printingById,
      languageOrder,
      conditionOrder,
    );
    const asBoxCopy = (copy: CopyResponse): DeckBoxCopy | undefined => {
      const printing = printingById.get(copy.printingId);
      return printing ? toBoxCopy(copy, printing, collectionNameById) : undefined;
    };
    const boxCopies = boxOrder(inBoxByCard.get(cardId) ?? [], comparator, pinnedCopyIds);
    const heldCount = Math.min(boxCopies.length, needed);
    const settled = boxCopies.slice(0, heldCount).toSorted(comparator);
    const spare = groupAlternatives(
      boxCopies.slice(heldCount + (otherDeckNeeds?.get(cardId) ?? 0)),
      asBoxCopy,
    );
    const fills: SlotFill[] = settled.flatMap((copy) => {
      const boxCopy = asBoxCopy(copy);
      if (!boxCopy) {
        return [];
      }
      const key = alternativeKey(copy);
      return [
        {
          state: "in-box" as const,
          copy: boxCopy,
          alternatives: spare.filter((candidate) => candidate.key !== key),
        },
      ];
    });
    const inBox = fills.length;
    neededTotal += needed;
    inBoxTotal += inBox;
    fillsByCard.set(cardId, fills);

    const shortfall = needed - inBox;
    if (shortfall === 0) {
      continue;
    }

    const ranked = (candidatesByCard.get(cardId) ?? []).toSorted(comparator);
    const chosen = boxOrder(ranked, comparator, pinnedCopyIds)
      .slice(0, shortfall)
      .toSorted(comparator);
    const taken = new Set(chosen.map((copy) => copy.id));

    const free = groupAlternatives(
      ranked.filter((copy) => !taken.has(copy.id)),
      asBoxCopy,
    );
    for (const copy of chosen) {
      const boxCopy = asBoxCopy(copy);
      if (!boxCopy) {
        continue;
      }
      const held = alternativeKey(copy);
      fills.push({
        state: "available",
        copy: boxCopy,
        alternatives: free.filter((candidate) => candidate.key !== held),
      });
    }

    // Loans are reported before trade reservations so a card blocked both
    // ways names the one the viewer can act on first.
    let uncovered = needed - fills.length;
    const stuck = blockedByCard.get(cardId);
    if (stuck && uncovered > 0) {
      const takeHeld = (pool: readonly CopyResponse[], reason: "loan" | "trade") => {
        const held = pool
          .toSorted(comparator)
          .slice(0, uncovered)
          .flatMap((copy) => {
            const boxCopy = asBoxCopy(copy);
            return boxCopy
              ? [{ state: "blocked" as const, reason, copy: boxCopy, alternatives: [] }]
              : [];
          });
        fills.push(...held);
        uncovered -= held.length;
      };
      takeHeld(stuck.loan, "loan");
      takeHeld(stuck.trade, "trade");
    }
    missingCount += uncovered;
    for (let slot = 0; slot < uncovered; slot++) {
      fills.push({ state: "missing", alternatives: [] });
    }
  }

  const slots: DeckBoxSlot[] = [];
  const usedByCard = new Map<string, number>();
  for (const card of cards) {
    if (!isCountedZone(card.zone)) {
      continue;
    }
    const fills = fillsByCard.get(card.cardId) ?? [];
    const cardKey = getDeckCardKey(card);
    let used = usedByCard.get(card.cardId) ?? 0;
    for (let index = 0; index < card.quantity; index++) {
      const fill = fills[used];
      used += 1;
      if (fill) {
        slots.push({ key: `${cardKey}:${index}`, cardId: card.cardId, cardKey, ...fill });
      }
    }
    usedByCard.set(card.cardId, used);
  }

  const extras: DeckBoxExtra[] = [];
  let extraCount = 0;
  for (const [cardId, boxCopies] of inBoxByCard) {
    const deckNeed = needsByCard.get(cardId);
    const allowance = (deckNeed?.needed ?? 0) + (otherDeckNeeds?.get(cardId) ?? 0);
    if (boxCopies.length <= allowance) {
      continue;
    }
    const ranked = boxOrder(
      boxCopies,
      candidateComparator(
        pinnedByCard.get(cardId) ?? null,
        printingById,
        languageOrder,
        conditionOrder,
      ),
      pinnedCopyIds,
    );
    const surplus = ranked.slice(allowance).flatMap((copy) => {
      const printing = printingById.get(copy.printingId) ?? printingsById[copy.printingId];
      return printing ? [toBoxCopy(copy, printing, collectionNameById)] : [];
    });
    if (surplus.length === 0) {
      continue;
    }
    const catalogCard = printingsById[boxCopies[0]?.printingId ?? ""]?.card;
    const card = deckNeed?.card ?? (catalogCard && toBoxCardFromCatalog(cardId, catalogCard));
    if (!card) {
      continue;
    }
    extraCount += surplus.length;
    extras.push({ card, copies: surplus });
  }

  return {
    neededTotal,
    inBoxTotal,
    slots,
    missingCount,
    extras: extras.toSorted((a, b) => compareCardDisplayName(a.card, b.card)),
    extraCount,
    siblingPrintingsByCardId: new Map(
      [...siblingsByCard].map(([cardId, seen]) => [cardId, [...seen.values()]]),
    ),
  };
}
