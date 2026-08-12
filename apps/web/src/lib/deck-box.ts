import type {
  Card,
  CardType,
  CopyResponse,
  Domain,
  Finish,
  Printing,
  Rarity,
} from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

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
 * The card-level marks a box row renders, the same ones the deck list shows:
 * name, domains, and the two costs. Carried per row rather than looked up at
 * render time, because the sweep names cards the deck doesn't run.
 */
export interface DeckBoxCard {
  cardId: string;
  name: string;
  /** Full type set, for the legend display name. */
  types: CardType[];
  tags: string[];
  domains: Domain[];
  energy: number | null;
  power: number | null;
}

/** One physical copy that could go in the box. */
export interface DeckBoxCopy {
  copyId: string;
  printingId: string;
  shortCode: string;
  rarity: Rarity;
  /** Front-face art of this printing, or null when it has none on file. */
  imageId: string | null;
  language: string;
  finish: Finish;
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
   * Identifies the outstanding copy for a swap (card plus its index among that
   * card's outstanding copies), so a hand-picked source sticks even as the
   * ranking around it changes. Available slots only.
   */
  slotKey?: string;
  /** Movable copies of the same card this slot could take instead. */
  alternatives: DeckBoxCopy[];
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
   * Per-slot copy choices the viewer made by hand, keyed by
   * {@link DeckBoxSlot.slotKey}. A choice that no longer applies (the copy
   * moved, was lent out, or is already in the box) is ignored.
   */
  overrides?: ReadonlyMap<string, string>;
}

/**
 * Overflow is a parking zone rather than part of the deck, so its cards never
 * belong in the box — the same rule the ownership figures use.
 * @returns True when copies of this zone travel with the deck.
 */
function isCountedZone(zone: string): boolean {
  return zone !== WellKnown.deckZone.OVERFLOW;
}

/**
 * Ranks the copies of one card, best pick first. The deck's pinned printing
 * wins, then the viewer's language order, then anything not graded, then the
 * most worn copy — a deck should be built from the beaters, not from the copy
 * someone slabbed. An unrecorded condition sits mid-scale rather than last, so
 * a copy explicitly marked mint is still passed over for a plain one.
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
    // Descending: the higher the index, the more worn the copy.
    const condition = conditionScore(b.condition) - conditionScore(a.condition);
    if (condition !== 0) {
      return condition;
    }
    return a.id.localeCompare(b.id);
  };
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
    finish: printing.finish,
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
    energy: card.energy,
    power: card.power,
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
    energy: card.energy,
    power: card.power,
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
  overrides,
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
    const boxCopies = (inBoxByCard.get(cardId) ?? []).toSorted(comparator);
    const fills: SlotFill[] = boxCopies
      .slice(0, Math.min(boxCopies.length, needed))
      .flatMap((copy) => {
        const boxCopy = asBoxCopy(copy);
        return boxCopy ? [{ state: "in-box" as const, copy: boxCopy, alternatives: [] }] : [];
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
    // Hand-picked copies lead, in slot order, so a swap sticks even as the
    // ranking around it changes.
    const chosen: CopyResponse[] = [];
    const taken = new Set<string>();
    for (let slot = 0; slot < shortfall; slot++) {
      const overrideId = overrides?.get(`${cardId}:${slot}`);
      const override = overrideId
        ? ranked.find((copy) => copy.id === overrideId && !taken.has(copy.id))
        : undefined;
      if (override) {
        chosen.push(override);
        taken.add(override.id);
      }
    }
    for (const copy of ranked) {
      if (chosen.length >= shortfall) {
        break;
      }
      if (!taken.has(copy.id)) {
        chosen.push(copy);
        taken.add(copy.id);
      }
    }

    const allCopies = ranked.map((copy) => asBoxCopy(copy)).filter((copy) => copy !== undefined);
    for (const [slot, copy] of chosen.entries()) {
      const boxCopy = asBoxCopy(copy);
      if (!boxCopy) {
        continue;
      }
      fills.push({
        state: "available",
        slotKey: `${cardId}:${slot}`,
        copy: boxCopy,
        alternatives: allCopies.filter((candidate) => candidate.copyId !== copy.id),
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
    const ranked = boxCopies.toSorted(
      candidateComparator(
        pinnedByCard.get(cardId) ?? null,
        printingById,
        languageOrder,
        conditionOrder,
      ),
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
    extras: extras.toSorted((a, b) => a.card.name.localeCompare(b.card.name)),
    extraCount,
  };
}
