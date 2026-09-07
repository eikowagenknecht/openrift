import type { PromoGrouping, PromoSection } from "@/features/cards/lib/promo-groupings";
import type { ChannelNode } from "@/features/cards/lib/promos-tree";

const COMPACT_LEAF_THRESHOLD = 4;

const BREADCRUMB_SEP = " › ";

export type FlatSectionKind = Exclude<PromoGrouping, "channel">;

export interface PromoTocItem {
  id: string;
  label: string;
  level: number;
}

export interface ChannelRenderItem {
  kind: "leaf" | "compact";
  node: ChannelNode;
  ancestors: string[];
  parentAnchorIds: string[];
  sectionId: string;
  title: string;
}

export interface FlatRenderItem {
  section: PromoSection;
  sectionId: string;
  title: string;
}

function isCompactBranch(node: ChannelNode): boolean {
  if (node.children.length === 0) {
    return false;
  }
  return node.children.every(
    (child) => child.children.length === 0 && child.printings.length <= COMPACT_LEAF_THRESHOLD,
  );
}

function flatSectionAnchor(languagePrefix: string, kind: FlatSectionKind, id: string): string {
  return `${languagePrefix}-${kind}-${id}`;
}

export function formatLanguageAggregate(
  languageLabel: string,
  printingCount: number,
  cardCount: number,
): string {
  const printingWord = printingCount === 1 ? "printing" : "printings";
  const cardWord = cardCount === 1 ? "card" : "cards";
  return `OpenRift currently has data on ${printingCount} ${languageLabel} promo ${printingWord} across ${cardCount} ${cardWord}.`;
}

/**
 * Non-leaf entries scroll to a hidden anchor at the start of their first
 * descendant section; the TOC stays depth-indented though content is flat.
 */
export function collectChannelTocItems(
  nodes: ChannelNode[],
  languageSectionId: string,
  depth: number,
  items: PromoTocItem[],
): void {
  for (const node of nodes) {
    if (node.localPrintingCount === 0) {
      continue;
    }
    items.push({
      id: `${languageSectionId}-ch-${node.channel.id}`,
      label: node.channel.label,
      level: depth,
    });
    if (node.children.length === 0) {
      continue;
    }
    collectChannelTocItems(node.children, languageSectionId, depth + 1, items);
  }
}

export function collectFlatSectionTocItems(
  sections: PromoSection[],
  languagePrefix: string,
  kind: FlatSectionKind,
): PromoTocItem[] {
  return sections.map((section) => ({
    id: flatSectionAnchor(languagePrefix, kind, section.id),
    label: section.label,
    level: 0,
  }));
}

export function flattenChannelSections(
  nodes: ChannelNode[],
  languagePrefix: string,
): ChannelRenderItem[] {
  const items: ChannelRenderItem[] = [];
  let pending: string[] = [];

  function walk(currentNodes: ChannelNode[], ancestors: string[]) {
    for (const node of currentNodes) {
      if (node.localPrintingCount === 0) {
        continue;
      }
      const sectionId = `${languagePrefix}-ch-${node.channel.id}`;
      const titleParts = [...ancestors, node.channel.label];
      const title = titleParts.join(BREADCRUMB_SEP);
      if (node.children.length === 0) {
        items.push({
          kind: "leaf",
          node,
          ancestors,
          parentAnchorIds: pending,
          sectionId,
          title,
        });
        pending = [];
      } else if (isCompactBranch(node)) {
        items.push({
          kind: "compact",
          node,
          ancestors,
          parentAnchorIds: pending,
          sectionId,
          title,
        });
        pending = [];
      } else {
        pending = [...pending, sectionId];
        walk(node.children, titleParts);
      }
    }
  }

  walk(nodes, []);
  return items;
}

export function buildFlatRenderItems(
  sections: PromoSection[],
  languagePrefix: string,
  kind: FlatSectionKind,
): FlatRenderItem[] {
  return sections.map((section) => ({
    section,
    sectionId: flatSectionAnchor(languagePrefix, kind, section.id),
    title: section.label,
  }));
}
