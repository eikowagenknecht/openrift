import type { DeckZone } from "@openrift/shared";

import type { DeckDiffCard } from "@/lib/deck-diff";
import { ZONE_DIFF_ORDER } from "@/lib/deck-diff";

/**
 * Unlike `deck-diff.ts`, which drops anything that matches, this keeps both
 * lists whole so a top-to-bottom comparison also shows unchanged cards.
 */

export interface SideBySideRow {
  cardId: string;
  cardName: string;
  from: number;
  to: number;
  kind: "same" | "add" | "cut" | "change";
}

export interface SideBySideZone {
  zone: DeckZone;
  rows: SideBySideRow[];
  fromCount: number;
  toCount: number;
}

function rowKind(from: number, to: number): SideBySideRow["kind"] {
  if (from === to) {
    return "same";
  }
  if (from === 0) {
    return "add";
  }
  if (to === 0) {
    return "cut";
  }
  return "change";
}

/**
 * Sums a side's copies per (card, zone). A card pinned to several printings
 * is several rows in the builder but one line in a comparison.
 */
function aggregate(cards: readonly DeckDiffCard[]): Map<string, DeckDiffCard> {
  const slots = new Map<string, DeckDiffCard>();
  for (const card of cards) {
    const key = `${card.zone}|${card.cardId}`;
    const existing = slots.get(key);
    if (existing) {
      existing.quantity += card.quantity;
      continue;
    }
    slots.set(key, { ...card });
  }
  return slots;
}

/**
 * A zone neither side uses is left out entirely; a zone only one side uses
 * stays, with the other column empty.
 */
export function alignDeckLists(
  from: readonly DeckDiffCard[],
  to: readonly DeckDiffCard[],
): SideBySideZone[] {
  const fromSlots = aggregate(from);
  const toSlots = aggregate(to);

  const byZone = new Map<DeckZone, SideBySideRow[]>();
  for (const key of new Set([...fromSlots.keys(), ...toSlots.keys()])) {
    const fromSlot = fromSlots.get(key);
    const toSlot = toSlots.get(key);
    const slot = toSlot ?? fromSlot;
    if (!slot) {
      continue;
    }
    const fromQuantity = fromSlot?.quantity ?? 0;
    const toQuantity = toSlot?.quantity ?? 0;
    const rows = byZone.get(slot.zone) ?? [];
    rows.push({
      cardId: slot.cardId,
      cardName: slot.cardName,
      from: fromQuantity,
      to: toQuantity,
      kind: rowKind(fromQuantity, toQuantity),
    });
    byZone.set(slot.zone, rows);
  }

  const zones: SideBySideZone[] = [];
  for (const zone of ZONE_DIFF_ORDER) {
    const rows = byZone.get(zone);
    if (!rows || rows.length === 0) {
      continue;
    }
    zones.push({
      zone,
      rows: rows.toSorted((left, right) => left.cardName.localeCompare(right.cardName)),
      fromCount: rows.reduce((total, row) => total + row.from, 0),
      toCount: rows.reduce((total, row) => total + row.to, 0),
    });
  }
  return zones;
}
