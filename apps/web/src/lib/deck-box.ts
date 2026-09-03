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

/**
 * What has to happen for a deck to physically sit in its box: which copies are
 * already there, which ones to pull out of which collection, which ones can't
 * move, and how many the viewer doesn't own at all.
 *
 * Everything here is derived from the live copies feed, so a move updates the
 * plan without any bookkeeping of its own — the box's contents are the state.
 */

/**
 * The card-level marks a box row renders: name, types and domains. Carried per
 * row rather than looked up at render time, because the sweep names cards the
 * deck doesn't run.
 */
export interface DeckBoxCard {
  cardId: string;
  name: string;
  /** Full type set, for the legend display name. */
  types: CardType[];
  tags: string[];
  domains: Domain[];
}

/**
 * One physical copy that could go in the box. It carries its printing's
 * variant attributes so a row can be labelled by the shared
 * {@link formatPrintingVariantLabelParts} rule rather than a rule of its own.
 */
export interface DeckBoxCopy extends VariantLabelPrinting {
  copyId: string;
  printingId: string;
  shortCode: string;
  rarity: Rarity;
  /** Front-face art of this printing, or null when it has none on file. */
  imageId: string | null;
  condition: string | null;
  grade: number | null;
  collectionId: string;
  collectionName: string;
}

/**
 * Where one copy the deck calls for stands: in the box already, waiting in
 * another collection, held up by a loan or a trade, or not owned at all.
 */
type DeckBoxSlotState = "in-box" | "available" | "blocked" | "missing";

/**
 * One other copy a slot could take, standing for every copy that is the same
 * choice: same printing, same collection, same condition. Ten identical runes
 * in one binder are one entry with a count, not ten rows that read alike.
 */
interface DeckBoxAlternative {
  /** What makes this a distinct choice, and the row's identity. */
  key: string;
  /** The copy a swap would actually take — the best-ranked one of the group. */
  copy: DeckBoxCopy;
  /** How many copies this entry stands for. */
  count: number;
}

/**
 * One copy the deck calls for, as its own row. A card with three copies in the
 * main zone has three slots, so each one can be ticked off (or swapped for a
 * different physical copy) on its own as the deck is sorted out.
 */
export interface DeckBoxSlot {
  /** Row identity: the deck card this slot belongs to, plus its place in it. */
  key: string;
  cardId: string;
  /** The deck row this slot fills, as {@link getDeckCardKey} spells it. */
  cardKey: string;
  state: DeckBoxSlotState;
  /**
   * The copy this slot stands for — the one in the box, the one a tick would
   * move in, or the one that's held up. A missing slot has none.
   */
  copy?: DeckBoxCopy;
  /**
   * The other choices this slot could take, best first. Copies the card's own
   * other slots already hold are left out, and so is a choice that matches what
   * the slot holds — swapping for an identical copy changes nothing.
   */
  alternatives: DeckBoxAlternative[];
  /** Why a blocked slot can't move: out on loan, or reserved for a trade. */
  reason?: "loan" | "trade";
}

/** What a slot holds, before it is tied to one of the deck's rows. */
type SlotFill = Omit<DeckBoxSlot, "key" | "cardId" | "cardKey">;

/**
 * Copies in the box that no deck stored there calls for — what a sweep offers
 * to move back out.
 */
interface DeckBoxExtra {
  card: DeckBoxCard;
  copies: DeckBoxCopy[];
}

export interface DeckBoxPlan {
  /** Copies the deck calls for, across every zone but Overflow. */
  neededTotal: number;
  /** Of those, how many are in the box already. */
  inBoxTotal: number;
  /** One row per copy the deck calls for, in the order the deck lists them. */
  slots: DeckBoxSlot[];
  /** Copies the viewer owns nowhere, so no move can supply them. */
  missingCount: number;
  extras: DeckBoxExtra[];
  /** How many copies the extras add up to, for the section's heading. */
  extraCount: number;
  /**
   * The distinct printings behind each card's copies here, for
   * {@link formatPrintingVariantLabelParts} to label a row against. Scoping
   * siblings to the copies actually listed is what keeps a row from naming an
   * attribute nothing on screen contradicts — an all-English collection reads
   * no "EN", the way a single-printing tile reads no variant.
   */
  siblingPrintingsByCardId: ReadonlyMap<string, VariantLabelPrinting[]>;
}

export interface DeckBoxInput {
  cards: readonly DeckBuilderCard[];
  copies: readonly CopyResponse[];
  homeCollectionId: string;
  printingsByCardId: ReadonlyMap<string, Printing[]>;
  /**
   * The whole catalog by printing id. The sweep has to name cards the deck
   * doesn't run, which `printingsByCardId` alone can't reach.
   */
  printingsById: Readonly<Record<string, Printing>>;
  collectionNameById: ReadonlyMap<string, string>;
  /**
   * Copies per card that *other* decks stored in the same box need. Two decks
   * may share one box, and the sweep must not offer to move out the other
   * deck's cards.
   */
  otherDeckNeeds?: ReadonlyMap<string, number>;
  /** Viewer's language preference, best first — the second-strongest pick rule. */
  languageOrder: readonly string[];
  /** Condition slugs best first (mint → poor), as `/init` orders them. */
  conditionOrder: readonly string[];
  /**
   * Copies the viewer picked by hand, by copy id. They are taken ahead of the
   * ranking, and a pick that no longer applies (the copy moved, was lent out,
   * or is already in the box) is ignored. Held per card rather than per row
   * because a card's rows are interchangeable: ticking one off shortens the
   * list, and a pick tied to a row's place in it would be lost with it.
   */
  pinnedCopyIds?: ReadonlySet<string>;
}

/**
 * Finishes plainest first. A premium copy is the one worth keeping out of a
 * deck that travels, so it is picked only once nothing plainer is left.
 */
const FINISH_ORDER: readonly string[] = [
  WellKnown.finish.NORMAL,
  WellKnown.finish.FOIL,
  WellKnown.finish.METAL,
  WellKnown.finish.METAL_DELUXE,
];

/**
 * Ranks the copies of one card, best pick first. The deck's pinned printing
 * wins, then the viewer's language order, then anything not graded, then the
 * plainest finish, then the most worn copy — a deck should be built from the
 * beaters, not from the foil or the copy someone slabbed. An unrecorded
 * condition sits mid-scale rather than last, so a copy explicitly marked mint
 * is still passed over for a plain one.
 * @returns A sort comparator over candidate copies of the same card.
 */
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
    // Descending: the higher the index, the more worn the copy.
    const condition = conditionScore(b.condition) - conditionScore(a.condition);
    if (condition !== 0) {
      return condition;
    }
    return a.id.localeCompare(b.id);
  };
}

/**
 * The order the box takes a card's copies in: hand-picked first, then the
 * ranking. A pick is held per card rather than per slot, because a card's slots
 * are interchangeable. It says "this copy comes along", not "this row takes
 * it".
 * @returns The copies in the order the box would claim them.
 */
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

/**
 * What makes one copy a different choice from another when picking a source.
 * Everything else a copy carries (its id, when it was added) is bookkeeping
 * that says nothing about which card you would pull off the shelf.
 * @returns The choice's identity.
 */
function alternativeKey(copy: CopyResponse): string {
  return [copy.printingId, copy.collectionId, copy.condition ?? "", copy.grade ?? ""].join("|");
}

/**
 * Folds candidates that are the same choice into one entry each, keeping the
 * ranking they arrive in. The best-ranked copy of a group is the one a swap
 * takes, so picking the entry picks the same copy the plan would have.
 * @returns One entry per distinct choice, best first.
 */
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

/**
 * Projects a copy plus its printing into the shape the box view renders.
 * @returns The display copy.
 */
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

/**
 * The card behind a deck slot. Exported for the box view, whose deck rows carry
 * the builder card rather than a plan entry.
 * @returns The display card.
 */
export function toBoxCardFromDeck(card: DeckBuilderCard): DeckBoxCard {
  return {
    cardId: card.cardId,
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
    domains: card.domains,
  };
}

/**
 * The card behind a copy the deck doesn't run, taken from the catalog instead.
 * @returns The display card.
 */
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
 * Works out what it takes to fill a deck's box.
 *
 * A copy sitting in the box but out on loan or reserved for a trade counts as
 * absent, because it is: the box has a gap where it should be, and the copy
 * shows up under blocked rather than as settled.
 * @returns The plan, with pull groups ordered by collection name and each
 *   group's rows in set-and-number order, the way the cards sit in a binder.
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
  // Copies of cards this deck doesn't run are none of this plan's business, so
  // index only the printings the deck can use.
  const printingById = new Map<string, Printing>();
  // Card and copy count in one entry: every list below needs both, and keeping
  // them together is what lets a row carry its card without a lookup that could
  // come back empty.
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
    // A card split across zones keeps the first pin it declares; the zones
    // agree in practice, and a pin is only a preference here anyway.
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
  // The printings behind each card's copies, deduped as they are bucketed, so a
  // row is labelled against exactly what the box lists beside it.
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
      // The box's whole contents, not just this deck's cards: the sweep reports
      // the ones no deck stored here calls for. A lent-out or reserved copy is
      // left out — it isn't in the box to be swept.
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
    // personal box would take it from everybody. They are never candidates.
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

  // What fills each card's slots, best first: the copies already in the box,
  // then the ones a pull would take, then the ones that are held up. Anything
  // still short is a slot no move can fill.
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
    // Rank the box's copies the same way a pull does, so the ones that stay are
    // the ones this deck would have chosen and any surplus the sweep offers is
    // the nicest copy, not an arbitrary one.
    const boxCopies = boxOrder(inBoxByCard.get(cardId) ?? [], comparator, pinnedCopyIds);
    const heldCount = Math.min(boxCopies.length, needed);
    const settled = boxCopies.slice(0, heldCount).toSorted(comparator);
    // Copies the box holds past what every deck stored there needs. Swapping a
    // settled row for one of these only changes which copy travels with the
    // deck, so it asks for no move, and the one it drops becomes the sweep's
    // offer instead.
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
    // Hand-picked copies come along whatever the ranking says; the best of the
    // rest fill what is left. The result is listed in ranking order all the
    // same, so the rows read the way every other list of copies here does.
    const chosen = boxOrder(ranked, comparator, pinnedCopyIds)
      .slice(0, shortfall)
      .toSorted(comparator);
    const taken = new Set(chosen.map((copy) => copy.id));

    // Only copies no slot of this card has claimed: offering one slot the copy
    // another is already holding is offering nothing.
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

    // Whatever the pulls don't cover is either spoken for or not owned. Loans
    // are reported before trade reservations so a card blocked both ways names
    // the one the viewer can act on first.
    let uncovered = needed - fills.length;
    const stuck = blockedByCard.get(cardId);
    if (stuck && uncovered > 0) {
      // Ranked like a pull: a card with more copies held up than the deck is
      // short of names the ones it would have taken, not arbitrary ones.
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

  // Hand each deck row its share of the card's slots, in the order the deck
  // lists them: a card split across zones fills the first zone it appears in
  // before the next.
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

  // The sweep: everything in the box past what the decks stored there call for.
  // A card no deck here runs has an allowance of zero, so all of its copies are
  // surplus.
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
    // A card the deck doesn't run has no deck slot to describe it, so the
    // catalog entry behind one of its copies stands in.
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
