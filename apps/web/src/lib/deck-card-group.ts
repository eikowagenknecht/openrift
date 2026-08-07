import type { CardType } from "@openrift/shared";

import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { TYPE_GROUP_ORDER } from "@/lib/deck-card-sort";
import { comboKey } from "@/lib/stat-types";

/**
 * Grouping axis for the cards inside a grouped zone (main / sideboard /
 * overflow). "type" is the classic Units / Spells / Gear split; "none" renders
 * the zone as one flat run with no sub-headers.
 */
export type DeckOverviewGroup = "type" | "energy" | "domain" | "ownership" | "none";

/** One rendered sub-group of a zone: header label plus its cards. */
export interface DeckCardGroup {
  key: string;
  /** Ready-to-render header text; `null` for the single "none" group. */
  label: string | null;
  cards: DeckBuilderCard[];
}

/** Per-axis lookups the grouping needs beyond the cards themselves. */
export interface DeckCardGroupContext {
  /** Card-type slug → display label. */
  typeLabels: Record<string, string>;
  /** Domain slug → display label. */
  domainLabels: Record<string, string>;
  /** Domain slugs in display order, for stable combo ordering. */
  domainOrder: readonly string[];
  /**
   * Resolves the viewer's ownership entry for a card. Only read by the
   * "ownership" axis — surfaces without ownership data must not offer it.
   */
  getEntry?: (card: DeckBuilderCard) => CardOwnership | undefined;
}

/** Bucket keys for the ownership axis, in ascending display order. */
const OWNERSHIP_GROUPS = [
  { key: "owned", label: "Owned" },
  { key: "partial", label: "Missing copies" },
  { key: "missing", label: "Not owned" },
] as const;

/**
 * Buckets one card for the ownership axis from its entry's owned/shortfall
 * split. Cards without an entry count as owned — ownership data covers every
 * deck card when it is loaded at all.
 * @returns The bucket key.
 */
function ownershipBucket(
  entry: CardOwnership | undefined,
): (typeof OWNERSHIP_GROUPS)[number]["key"] {
  if (!entry || entry.shortfall <= 0) {
    return "owned";
  }
  return entry.owned > 0 ? "partial" : "missing";
}

/**
 * Orders the card types the way the zones display them: the known
 * Unit → Spell → Gear ladder first, anything else after in first-seen order.
 * @returns The present type keys, ordered.
 */
function orderedTypeKeys(grouped: Map<CardType, DeckBuilderCard[]>): CardType[] {
  return [
    ...TYPE_GROUP_ORDER.filter((type) => grouped.has(type)),
    ...[...grouped.keys()].filter((type) => !TYPE_GROUP_ORDER.includes(type)),
  ];
}

/**
 * Splits a zone's cards into display sub-groups along the chosen axis. The
 * caller sorts inside each group (sortDeckOverviewList) — this only decides
 * membership, header text, and group order. `dir` flips the group order;
 * membership never changes with direction.
 * @returns The ordered groups; always at least one when `cards` is non-empty.
 */
export function groupDeckCards(
  cards: DeckBuilderCard[],
  groupBy: DeckOverviewGroup,
  dir: "asc" | "desc",
  ctx: DeckCardGroupContext,
): DeckCardGroup[] {
  if (cards.length === 0) {
    return [];
  }
  const groups = buildGroups(cards, groupBy, ctx);
  return dir === "desc" ? groups.toReversed() : groups;
}

/**
 * @returns The groups for {@link groupDeckCards}, in ascending order.
 */
function buildGroups(
  cards: DeckBuilderCard[],
  groupBy: DeckOverviewGroup,
  ctx: DeckCardGroupContext,
): DeckCardGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: null, cards }];
  }

  if (groupBy === "type") {
    const grouped = Map.groupBy(cards, (card) => card.cardType);
    return orderedTypeKeys(grouped).map((type) => ({
      key: type,
      label: `${ctx.typeLabels[type] ?? type}s`,
      cards: grouped.get(type) ?? [],
    }));
  }

  if (groupBy === "energy") {
    // Costless cards (runes, battlefields parked in overflow) trail the
    // numeric buckets rather than masquerading as 0-cost plays.
    const grouped = Map.groupBy(cards, (card) => card.energy ?? null);
    const numeric = [...grouped.keys()]
      .filter((energy): energy is number => energy !== null)
      .toSorted((a, b) => a - b);
    const groups: DeckCardGroup[] = numeric.map((energy) => ({
      key: `energy-${energy}`,
      label: `${energy} energy`,
      cards: grouped.get(energy) ?? [],
    }));
    const costless = grouped.get(null);
    if (costless) {
      groups.push({ key: "energy-none", label: "No energy cost", cards: costless });
    }
    return groups;
  }

  if (groupBy === "domain") {
    const grouped = Map.groupBy(cards, (card) => comboKey(card.domains, ctx.domainOrder));
    // Same interleaving as the stats charts: combos sit at the average
    // position of their domains, singles before pairs on a tie, and
    // domainless cards trail everything.
    const comboPosition = (key: string) => {
      if (key === "") {
        return Number.POSITIVE_INFINITY;
      }
      const domains = key.split("+");
      return (
        domains.reduce((sum, domain) => sum + ctx.domainOrder.indexOf(domain), 0) / domains.length
      );
    };
    const orderedKeys = [...grouped.keys()].toSorted((a, b) => {
      const posDiff = comboPosition(a) - comboPosition(b);
      if (posDiff !== 0 && !Number.isNaN(posDiff)) {
        return posDiff;
      }
      return a.split("+").length - b.split("+").length;
    });
    return orderedKeys.map((key) => ({
      key: key === "" ? "domain-none" : `domain-${key}`,
      label:
        key === ""
          ? "No domain"
          : key
              .split("+")
              .map((domain) => ctx.domainLabels[domain] ?? domain)
              .join(" / "),
      cards: grouped.get(key) ?? [],
    }));
  }

  // groupBy === "ownership"
  const grouped = Map.groupBy(cards, (card) => ownershipBucket(ctx.getEntry?.(card)));
  return OWNERSHIP_GROUPS.filter((bucket) => grouped.has(bucket.key)).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    cards: grouped.get(bucket.key) ?? [],
  }));
}
