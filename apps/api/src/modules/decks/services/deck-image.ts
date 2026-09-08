import type { ShareImageAspect } from "@openrift/shared/share-image-params";
import { legendDisplayName } from "@openrift/shared/utils";

import type { Repos } from "../../../deps.js";
import type { Io } from "../../../io.js";
import { renderLandscapeDeckImage } from "./deck-image-landscape.js";
import type { DeckImageCard, DeckImageCardRef, DeckImageInput } from "./deck-image-parts.js";
import { renderVerticalDeckImage } from "./deck-image-vertical.js";

// Re-exported so the routes, the oEmbed handler, and the tests keep importing
// the deck image's public surface from one module.
export type { DeckImageCard, DeckImageCardRef, DeckImageInput } from "./deck-image-parts.js";
export { splitDeckZones, truncateTitle } from "./deck-image-parts.js";

/** Honors the pinned cover printing the same way the web resolves it. */
export async function resolveCoverImageId(
  repos: Pick<Repos, "canonicalPrintings">,
  deck: { coverCardId: string | null; coverPrintingId: string | null },
): Promise<string | null> {
  if (!deck.coverCardId) {
    return null;
  }
  const metas = await repos.canonicalPrintings.resolvePrintingMetaForRows([
    { cardId: deck.coverCardId, preferredPrintingId: deck.coverPrintingId },
  ]);
  return metas[0]?.imageId ?? null;
}

/**
 * Mirrors how the public deck route enriches cards. Shared by the by-id
 * builder (server decks) and the from-cards render endpoint (browser-local
 * decks, which have no server row).
 */
export async function buildDeckImageCardsFromRefs(
  repos: Pick<Repos, "catalog" | "canonicalPrintings">,
  cards: readonly DeckImageCardRef[],
  options: { skipUnknown?: boolean } = {},
): Promise<DeckImageCard[]> {
  const uniqueCardIds = [...new Set(cards.map((card) => card.cardId))];
  const [cardMetas, printingMetas] = await Promise.all([
    repos.catalog.cardsByIds(uniqueCardIds),
    repos.canonicalPrintings.resolvePrintingMetaForRows(
      cards.map((card) => ({ cardId: card.cardId, preferredPrintingId: card.preferredPrintingId })),
    ),
  ]);
  const metaById = new Map(cardMetas.map((meta) => [meta.id, meta]));
  const result: DeckImageCard[] = [];
  for (const [index, row] of cards.entries()) {
    const meta = metaById.get(row.cardId);
    if (!meta) {
      // The by-id caller treats a missing card as a broken invariant; the
      // public from-cards endpoint tolerates a stale/unknown id and drops it.
      if (options.skipUnknown) {
        continue;
      }
      throw new Error(`Missing enrichment for deck card ${row.cardId}`);
    }
    result.push({
      cardName: legendDisplayName(meta),
      quantity: row.quantity,
      imageId: printingMetas[index]?.imageId ?? null,
      energy: meta.energy,
      domains: meta.domains,
      zone: row.zone,
    });
  }
  return result;
}

export async function buildDeckImageCards(
  repos: Pick<Repos, "decks" | "catalog" | "canonicalPrintings">,
  deckId: string,
  userId: string,
): Promise<DeckImageCard[]> {
  const cards = await repos.decks.cardsForDeck(deckId, userId);
  return buildDeckImageCardsFromRefs(repos, cards);
}

/**
 * `scale` renders the same base layout at N× resolution for the HQ download;
 * `aspect` picks the canvas (landscape for the og:image, vertical for the 9:16
 * export).
 */
export function renderDeckImage(
  io: Io,
  input: DeckImageInput,
  scale = 1,
  aspect: ShareImageAspect = "landscape",
): Promise<Buffer> {
  return aspect === "vertical"
    ? renderVerticalDeckImage(io, input, scale)
    : renderLandscapeDeckImage(io, input, scale);
}
