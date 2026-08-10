import type { CopyResponse, Finish, Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * What has to happen for a deck to physically sit in its box: which copies are
 * already there, which ones to pull out of which collection, which ones can't
 * move, and how many the viewer doesn't own at all.
 *
 * Everything here is derived from the live copies feed, so a move updates the
 * plan without any bookkeeping of its own — the box's contents are the state.
 */

/** One physical copy that could go in the box. */
export interface DeckBoxCopy {
  copyId: string;
  printingId: string;
  shortCode: string;
  language: string;
  finish: Finish;
  condition: string | null;
  grade: number | null;
  collectionId: string;
  collectionName: string;
}

/** One copy to pull, with the other copies that could take its place. */
export interface DeckBoxPull {
  /**
   * Identifies the outstanding copy this row stands for (card plus its index
   * among that card's outstanding copies), so a swap can be remembered without
   * depending on which copy is currently picked.
   */
  slotKey: string;
  cardId: string;
  cardName: string;
  copy: DeckBoxCopy;
  /** Movable copies of the same card that this row could use instead. */
  alternatives: DeckBoxCopy[];
}

/** The copies to pull out of one collection, in the order they sit in it. */
export interface DeckBoxGroup {
  collectionId: string;
  collectionName: string;
  pulls: DeckBoxPull[];
}

/** A card the deck still needs whose remaining copies can't be moved. */
export interface DeckBoxBlocked {
  cardId: string;
  cardName: string;
  count: number;
  /** Out on a loan, or reserved for a live outgoing trade. */
  reason: "loan" | "trade";
}

/** A card already sitting in the box, and how many of its copies are there. */
export interface DeckBoxSettled {
  cardId: string;
  cardName: string;
  count: number;
}

export interface DeckBoxPlan {
  /** Copies the deck calls for, across every zone but Overflow. */
  neededTotal: number;
  /** Of those, how many are in the box already. */
  inBoxTotal: number;
  groups: DeckBoxGroup[];
  settled: DeckBoxSettled[];
  blocked: DeckBoxBlocked[];
  /** Copies the viewer owns nowhere, so no move can supply them. */
  missingCount: number;
}

export interface DeckBoxInput {
  cards: readonly DeckBuilderCard[];
  copies: readonly CopyResponse[];
  homeCollectionId: string;
  printingsByCardId: ReadonlyMap<string, Printing[]>;
  collectionNameById: ReadonlyMap<string, string>;
  /** Viewer's language preference, best first — the second-strongest pick rule. */
  languageOrder: readonly string[];
  /** Condition slugs best first (mint → poor), as `/init` orders them. */
  conditionOrder: readonly string[];
  /**
   * Per-slot copy choices the viewer made by hand, keyed by
   * {@link DeckBoxPull.slotKey}. A choice that no longer applies (the copy
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
    language: printing.language,
    finish: printing.finish,
    condition: copy.condition,
    grade: copy.grade,
    collectionId: copy.collectionId,
    collectionName: collectionNameById.get(copy.collectionId) ?? "",
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
  collectionNameById,
  languageOrder,
  conditionOrder,
  overrides,
}: DeckBoxInput): DeckBoxPlan {
  // Copies of cards this deck doesn't run are none of this plan's business, so
  // index only the printings the deck can use.
  const printingById = new Map<string, Printing>();
  const neededByCard = new Map<string, number>();
  const nameByCard = new Map<string, string>();
  const pinnedByCard = new Map<string, string | null>();
  for (const card of cards) {
    if (!isCountedZone(card.zone)) {
      continue;
    }
    neededByCard.set(card.cardId, (neededByCard.get(card.cardId) ?? 0) + card.quantity);
    nameByCard.set(card.cardId, card.cardName);
    // A card split across zones keeps the first pin it declares; the zones
    // agree in practice, and a pin is only a preference here anyway.
    if (!pinnedByCard.has(card.cardId)) {
      pinnedByCard.set(card.cardId, card.preferredPrintingId);
    }
    for (const printing of printingsByCardId.get(card.cardId) ?? []) {
      printingById.set(printing.id, printing);
    }
  }

  const inBoxByCard = new Map<string, number>();
  const blockedByCard = new Map<string, { loan: number; trade: number }>();
  const candidatesByCard = new Map<string, CopyResponse[]>();
  for (const copy of copies) {
    const printing = printingById.get(copy.printingId);
    if (!printing || !neededByCard.has(printing.cardId)) {
      continue;
    }
    const cardId = printing.cardId;
    if (copy.onLoan || copy.reserved) {
      const bucket = blockedByCard.get(cardId) ?? { loan: 0, trade: 0 };
      if (copy.onLoan) {
        bucket.loan += 1;
      } else {
        bucket.trade += 1;
      }
      blockedByCard.set(cardId, bucket);
      continue;
    }
    if (copy.collectionId === homeCollectionId) {
      inBoxByCard.set(cardId, (inBoxByCard.get(cardId) ?? 0) + 1);
      continue;
    }
    // A group binder's copies belong to the group, so moving one into a
    // personal box would take it from everybody. They are never candidates.
    if (copy.groupId !== null) {
      continue;
    }
    const bucket = candidatesByCard.get(cardId);
    if (bucket) {
      bucket.push(copy);
    } else {
      candidatesByCard.set(cardId, [copy]);
    }
  }

  const pullsByCollection = new Map<string, DeckBoxPull[]>();
  const settled: DeckBoxSettled[] = [];
  const blocked: DeckBoxBlocked[] = [];
  let neededTotal = 0;
  let inBoxTotal = 0;
  let missingCount = 0;

  for (const [cardId, needed] of neededByCard) {
    const cardName = nameByCard.get(cardId) ?? "";
    const inBox = Math.min(inBoxByCard.get(cardId) ?? 0, needed);
    neededTotal += needed;
    inBoxTotal += inBox;
    if (inBox > 0) {
      settled.push({ cardId, cardName, count: inBox });
    }

    const shortfall = needed - inBox;
    if (shortfall === 0) {
      continue;
    }

    const ranked = (candidatesByCard.get(cardId) ?? []).toSorted(
      candidateComparator(
        pinnedByCard.get(cardId) ?? null,
        printingById,
        languageOrder,
        conditionOrder,
      ),
    );
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

    const alternatives = ranked.map((copy) => {
      const printing = printingById.get(copy.printingId);
      return printing ? toBoxCopy(copy, printing, collectionNameById) : undefined;
    });
    const allCopies = alternatives.filter((copy) => copy !== undefined);

    chosen.forEach((copy, slot) => {
      const printing = printingById.get(copy.printingId);
      if (!printing) {
        return;
      }
      const pull: DeckBoxPull = {
        slotKey: `${cardId}:${slot}`,
        cardId,
        cardName,
        copy: toBoxCopy(copy, printing, collectionNameById),
        alternatives: allCopies.filter((candidate) => candidate.copyId !== copy.id),
      };
      const bucket = pullsByCollection.get(copy.collectionId);
      if (bucket) {
        bucket.push(pull);
      } else {
        pullsByCollection.set(copy.collectionId, [pull]);
      }
    });

    // Whatever the pulls don't cover is either spoken for or not owned. Loans
    // are reported before trade reservations so a card blocked both ways names
    // the one the viewer can act on first.
    let uncovered = shortfall - chosen.length;
    const stuck = blockedByCard.get(cardId);
    if (stuck && uncovered > 0) {
      const loan = Math.min(stuck.loan, uncovered);
      if (loan > 0) {
        blocked.push({ cardId, cardName, count: loan, reason: "loan" });
        uncovered -= loan;
      }
      const trade = Math.min(stuck.trade, uncovered);
      if (trade > 0) {
        blocked.push({ cardId, cardName, count: trade, reason: "trade" });
        uncovered -= trade;
      }
    }
    missingCount += uncovered;
  }

  const groups: DeckBoxGroup[] = [...pullsByCollection.entries()]
    .map(([collectionId, pulls]) => ({
      collectionId,
      collectionName: collectionNameById.get(collectionId) ?? "",
      // Binder order: set code then collector number, which `shortCode` spells
      // out ("OGS-005"), so a pull run walks the pages front to back.
      pulls: pulls.toSorted(
        (a, b) =>
          a.copy.shortCode.localeCompare(b.copy.shortCode) || a.cardName.localeCompare(b.cardName),
      ),
    }))
    .toSorted((a, b) => a.collectionName.localeCompare(b.collectionName));

  return {
    neededTotal,
    inBoxTotal,
    groups,
    settled: settled.toSorted((a, b) => a.cardName.localeCompare(b.cardName)),
    blocked: blocked.toSorted((a, b) => a.cardName.localeCompare(b.cardName)),
    missingCount,
  };
}
