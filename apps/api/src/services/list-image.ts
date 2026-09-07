import { mergeListEntriesByTarget } from "@openrift/shared/list-entries";

import type { Repos } from "../deps.js";
import type { ListEntryRow } from "../repositories/lists.js";
import type { ShareImageCard, ShareImageInput } from "./share-image.js";

/**
 * Prepares a single list's enriched entries into a share image. Shared by the
 * public og:image route, the bundle route, and the owner's download route so
 * the rendering and the work-bounding stay in one place.
 */

const RENDER_ENTRY_CAP = 60;

/** Drops the long tail before art lookup and render, so an oversized list can't
 * force unbounded per-request work. */
export function topByQuantity(entries: readonly ListEntryRow[]): readonly ListEntryRow[] {
  if (entries.length <= RENDER_ENTRY_CAP) {
    return entries;
  }
  return [...entries]
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, RENDER_ENTRY_CAP);
}

/** Resolves art for card-kind entries via the canonical printing, same as the card grids. */
export async function buildCards(
  entries: readonly ListEntryRow[],
  canonicalPrintings: Repos["canonicalPrintings"],
): Promise<ShareImageCard[]> {
  const cardKindIds = [
    ...new Set(entries.flatMap((entry) => (entry.kind === "card" ? [entry.cardId] : []))),
  ];

  const representativeImage = new Map<string, string | null>();
  if (cardKindIds.length > 0) {
    const metas = await canonicalPrintings.resolvePrintingMetaForRows(
      cardKindIds.map((cardId) => ({ cardId, preferredPrintingId: null })),
    );
    for (const meta of metas) {
      representativeImage.set(meta.cardId, meta.imageId);
    }
  }

  return entries.map((entry) => ({
    cardName: entry.cardName,
    quantity: entry.quantity,
    imageId:
      entry.kind === "card" ? (representativeImage.get(entry.cardId) ?? null) : entry.imageId,
  }));
}

/** CORS_ORIGIN is a comma-separated allow-list; new URL() on the whole string
 * mis-parses the authority, so only the first origin is used. */
export function siteHostFromOrigin(corsOrigin: string | undefined): string | undefined {
  const firstOrigin = corsOrigin?.split(",")[0]?.trim();
  if (!firstOrigin) {
    return undefined;
  }
  try {
    return new URL(firstOrigin).host || undefined;
  } catch {
    return undefined;
  }
}

/** Same first-origin rule as {@link siteHostFromOrigin}. */
export function shareUrlFromOrigin(
  corsOrigin: string | undefined,
  path: string,
): string | undefined {
  const firstOrigin = corsOrigin?.split(",")[0]?.trim();
  return firstOrigin ? `${firstOrigin}${path}` : undefined;
}

function intentLabel(intent: string): string {
  if (intent === "trade") {
    return "Trade list";
  }
  if (intent === "wish") {
    return "Wishlist";
  }
  return "List";
}

// Mirrors the share text's KIND_NOUN.
function unitForKind(kind: string): { one: string; many: string } {
  if (kind === "printing" || kind === "copy") {
    return { one: "printing", many: "printings" };
  }
  return { one: "card", many: "cards" };
}

export interface ListImageData {
  ownerName: string;
  listName: string;
  intent: string;
  kind: string;
  entries: readonly ListEntryRow[];
  siteHost?: string;
  shareUrl?: string;
  canonicalPrintings: Repos["canonicalPrintings"];
}

/** Runs the art lookup on the caller's thread; the result crosses to a render worker. */
export async function buildListShareInput(data: ListImageData): Promise<ShareImageInput> {
  // Trade (copy) lists carry one entry per physical copy; merge copies of the
  // same printing so the grid shows one tile per printing with the total count.
  const display = data.kind === "copy" ? mergeListEntriesByTarget(data.entries) : data.entries;
  const cards = await buildCards(topByQuantity(display), data.canonicalPrintings);
  return {
    ownerName: data.ownerName,
    title: data.listName,
    intentLabel: intentLabel(data.intent),
    unit: unitForKind(data.kind),
    cards,
    totalCount: display.length,
    siteHost: data.siteHost,
    shareUrl: data.shareUrl,
  };
}
