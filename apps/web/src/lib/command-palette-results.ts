import type { QuickAddCardResult } from "@/features/collections/lib/quick-add-result";
import type { HelpArticle } from "@/lib/help-article";
import type { NavItemConfig } from "@/lib/nav-items";

export type QuickAddVerb = "add" | "move";

const PALETTE_MIN_QUERY_LENGTH = 2;

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
  cards: QuickAddCardResult[];
  navItems: NavItemConfig[];
  helpArticles: HelpArticle[];
  quickAdd: { label: string; moveLabel: string | null } | null;
}

function matches(query: string, ...haystack: (string | undefined)[]): boolean {
  return haystack.some((text) => text !== undefined && text.toLowerCase().includes(query));
}

/** Nav items are platform-gated, so the same destination can appear in both lists here; merge, keeping the richer description. */
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

/** Search rows sit at the bottom while cards matched, and move to the top when no card hit did. */
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
