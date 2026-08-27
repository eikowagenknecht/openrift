import type { HelpArticle } from "@/components/help/articles";
import type { NavItemConfig } from "@/components/layout/nav-items";
import type { QuickAddCardResult } from "@/hooks/use-quick-add-search";
import type { QuickAddVerb } from "@/stores/command-palette-store";

/** Shortest query that earns the help, page-search and rules-search rows. */
export const PALETTE_MIN_QUERY_LENGTH = 2;

const CARD_LIMIT = 6;
const NAV_LIMIT = 5;
const HELP_LIMIT = 3;

export type PaletteRow =
  | { kind: "quickAdd"; id: string; label: string; verb: QuickAddVerb }
  | { kind: "card"; id: string; card: QuickAddCardResult }
  | { kind: "nav"; id: string; item: NavItemConfig }
  | { kind: "help"; id: string; article: HelpArticle }
  | { kind: "searchCards"; id: string; query: string }
  | { kind: "searchRules"; id: string; query: string };

export interface PaletteGroup {
  heading: string;
  rows: PaletteRow[];
}

interface BuildPaletteGroupsInput {
  query: string;
  /** Ranked card hits from the shared matcher, already capped by the caller. */
  cards: QuickAddCardResult[];
  navItems: NavItemConfig[];
  helpArticles: HelpArticle[];
  /** The current route's quick-add, when it offers one. */
  quickAdd: { label: string; moveLabel: string | null } | null;
}

function matches(query: string, ...haystack: (string | undefined)[]): boolean {
  return haystack.some((text) => text !== undefined && text.toLowerCase().includes(query));
}

/**
 * One row per destination.
 *
 * A page may hold an entry in both nav lists, gated so that only one of them
 * renders per platform (Scan is primary on phones and lives under Organize on
 * desktop). The palette has no platform and shows both lists, so without this
 * that page appears twice. The surviving entry takes the richer description,
 * which is usually the one on the More entry.
 *
 * @returns The items with duplicate destinations folded together, in order.
 */
function dedupeByDestination(navItems: NavItemConfig[]): NavItemConfig[] {
  const byDestination = new Map<string, NavItemConfig>();
  for (const item of navItems) {
    const seen = byDestination.get(item.to);
    if (!seen) {
      byDestination.set(item.to, item);
      continue;
    }
    if (seen.description === undefined && item.description !== undefined) {
      byDestination.set(item.to, { ...seen, description: item.description });
    }
  }
  return [...byDestination.values()];
}

/**
 * The palette's rows, grouped and ordered.
 *
 * An empty query is the "what is here" view: the route's quick-add and the
 * whole navigation, no search rows. Typing narrows to cards first, since a card
 * name is what almost every query is.
 *
 * The two search rows hand the query to a real search surface. They sit at the
 * bottom while cards matched, and jump to the top when none did: a query with
 * no card hits is usually a rules question ("might", "showdown"), and burying
 * the way to ask it under an empty card list is how you never find it.
 *
 * @returns Non-empty groups, in display order.
 */
export function buildPaletteGroups({
  query,
  cards,
  navItems,
  helpArticles,
  quickAdd,
}: BuildPaletteGroupsInput): PaletteGroup[] {
  const trimmed = query.trim();
  const folded = trimmed.toLowerCase();
  const searchable = trimmed.length >= PALETTE_MIN_QUERY_LENGTH;

  // Add and move are two rows rather than a tab inside one, so both are
  // visible without entering either and neither needs a shortcut to be found.
  const quickAddRows: PaletteRow[] = (
    quickAdd
      ? [
          { label: quickAdd.label, verb: "add" as const },
          ...(quickAdd.moveLabel === null
            ? []
            : [{ label: quickAdd.moveLabel, verb: "move" as const }]),
        ]
      : []
  )
    .filter((action) => folded === "" || matches(folded, action.label))
    .map((action) => ({ kind: "quickAdd", id: `quick-add:${action.verb}`, ...action }));

  const uniqueNav = dedupeByDestination(navItems);
  const navRows: PaletteRow[] = uniqueNav
    .filter((item) => folded === "" || matches(folded, item.label, item.description))
    .slice(0, folded === "" ? uniqueNav.length : NAV_LIMIT)
    .map((item) => ({ kind: "nav", id: `nav:${item.to}`, item }));

  if (folded === "") {
    return [
      ...(quickAddRows.length > 0 ? [{ heading: "Actions", rows: quickAddRows }] : []),
      ...(navRows.length > 0 ? [{ heading: "Go to", rows: navRows }] : []),
    ];
  }

  const cardRows: PaletteRow[] = cards
    .slice(0, CARD_LIMIT)
    .map((card) => ({ kind: "card", id: `card:${card.cardId}`, card }));

  const helpRows: PaletteRow[] = searchable
    ? helpArticles
        .filter((article) => matches(folded, article.title, article.description))
        .slice(0, HELP_LIMIT)
        .map((article) => ({ kind: "help", id: `help:${article.slug}`, article }))
    : [];

  const searchRows: PaletteRow[] = searchable
    ? [
        { kind: "searchCards", id: "search:cards", query: trimmed },
        { kind: "searchRules", id: "search:rules", query: trimmed },
      ]
    : [];

  const groups: PaletteGroup[] = [];
  const pushSearch = () => {
    if (searchRows.length > 0) {
      groups.push({ heading: "Search", rows: searchRows });
    }
  };

  if (cardRows.length === 0) {
    pushSearch();
  }
  if (quickAddRows.length > 0) {
    groups.push({ heading: "Actions", rows: quickAddRows });
  }
  if (cardRows.length > 0) {
    groups.push({ heading: "Cards", rows: cardRows });
  }
  if (navRows.length > 0) {
    groups.push({ heading: "Go to", rows: navRows });
  }
  if (helpRows.length > 0) {
    groups.push({ heading: "Help", rows: helpRows });
  }
  if (cardRows.length > 0) {
    pushSearch();
  }
  return groups;
}
