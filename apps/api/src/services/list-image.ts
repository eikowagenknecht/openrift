import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { ListEntryRow } from "../repositories/lists.js";
import type { ShareImageCard } from "./share-image.js";
import { renderShareImage } from "./share-image.js";

/**
 * Prepares a single list's enriched entries into a share image (ADR-024).
 * Shared by the public og:image route, the bundle route, and the owner's
 * download route so the rendering and the work-bounding stay in one place.
 */

/** Max entries whose art we resolve per render; the grid only shows a dozen. */
const RENDER_ENTRY_CAP = 60;

/**
 * Keeps the entries most likely to be shown (the renderer leads with the
 * highest quantities) and drops the long tail before the batched art lookup and
 * the render, so an oversized list can't force unbounded per-request work.
 * @returns At most RENDER_ENTRY_CAP entries.
 */
export function topByQuantity(entries: readonly ListEntryRow[]): readonly ListEntryRow[] {
  if (entries.length <= RENDER_ENTRY_CAP) {
    return entries;
  }
  return [...entries]
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, RENDER_ENTRY_CAP);
}

/**
 * Maps enriched entries to render cards, resolving a representative printing's
 * art for card-kind entries (which carry no specific printing) the same way the
 * card grids pick a canonical printing.
 * @returns Render cards in entry order.
 */
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

/**
 * Derives the footer host (e.g. "openrift.app") from `CORS_ORIGIN`. That env var
 * is a comma-separated allow-list (see cors.ts), so we take the first origin;
 * running `new URL()` on the whole string mis-parses the authority.
 * @returns The host, or undefined when there is no parseable origin.
 */
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

/** @returns The caption label for a list's intent. */
function intentLabel(intent: string): string {
  if (intent === "trade") {
    return "Trade list";
  }
  if (intent === "wish") {
    return "Wishlist";
  }
  return "List";
}

/** @returns The count unit for a list kind (mirrors the share text's KIND_NOUN). */
function unitForKind(kind: string): { one: string; many: string } {
  // Copy (trade) lists merge to one tile per printing, so they count printings.
  if (kind === "printing" || kind === "copy") {
    return { one: "printing", many: "printings" };
  }
  return { one: "card", many: "cards" };
}

/**
 * Collapses copy-kind rows (one per physical copy) into one row per printing,
 * summing quantities — a trade binder shows one tile "3× Cleave" not three.
 * @returns One row per distinct printing.
 */
function mergeCopyRows(entries: readonly ListEntryRow[]): ListEntryRow[] {
  const byPrinting = new Map<string, ListEntryRow>();
  for (const entry of entries) {
    // Key by target id, not entry id — rule-only entries (ADR-034) have a null
    // entry id, which would collapse them all onto one bucket.
    const key = entry.kind === "card" ? entry.cardId : entry.printingId;
    const existing = byPrinting.get(key);
    byPrinting.set(
      key,
      existing ? { ...existing, quantity: existing.quantity + entry.quantity } : entry,
    );
  }
  return [...byPrinting.values()];
}

/** Everything needed to render a single list's share image. */
export interface ListImageData {
  ownerName: string;
  listName: string;
  intent: string;
  kind: string;
  entries: readonly ListEntryRow[];
  siteHost?: string;
  canonicalPrintings: Repos["canonicalPrintings"];
}

/**
 * Renders one list's share image from its enriched entries.
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderListImage(io: Io, data: ListImageData): Promise<Buffer> {
  // Trade (copy) lists carry one entry per physical copy; merge copies of the
  // same printing so the grid shows one tile per printing with the total count.
  const display = data.kind === "copy" ? mergeCopyRows(data.entries) : data.entries;
  const cards = await buildCards(topByQuantity(display), data.canonicalPrintings);
  return renderShareImage(io, {
    ownerName: data.ownerName,
    title: data.listName,
    intentLabel: intentLabel(data.intent),
    unit: unitForKind(data.kind),
    cards,
    totalCount: display.length,
    siteHost: data.siteHost,
  });
}
