import type { DeckImportEntry } from "@openrift/shared/deck-code";
import type { DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { inferZone } from "@openrift/shared/zone-inference";
import type { APIEmbed } from "discord.js";

import { EMBED_COLOR } from "./card-embed.js";
import type { CatalogCard, CatalogPrinting, CatalogSnapshot } from "./catalog-cache.js";

interface ResolvedDeckRow {
  entry: DeckImportEntry;
  card: CatalogCard;
  printing: CatalogPrinting;
  zone: DeckZone;
}

export interface ResolvedDeck {
  rows: ResolvedDeckRow[];
  unknownCodes: string[];
  totalCards: number;
}

export function resolveDeckEntries(
  snapshot: CatalogSnapshot,
  entries: DeckImportEntry[],
): ResolvedDeck {
  const byShortCode = new Map<string, { card: CatalogCard; printing: CatalogPrinting }>();
  const cardsById = new Map(snapshot.cards.map((card) => [card.id, card]));
  for (const printings of snapshot.printingsByCardId.values()) {
    for (const printing of printings) {
      const card = cardsById.get(printing.cardId);
      if (card && !byShortCode.has(printing.shortCode.toUpperCase())) {
        byShortCode.set(printing.shortCode.toUpperCase(), { card, printing });
      }
    }
  }

  const rows: ResolvedDeckRow[] = [];
  const unknownCodes: string[] = [];
  for (const entry of entries) {
    const match = entry.shortCode ? byShortCode.get(entry.shortCode.toUpperCase()) : undefined;
    if (!match) {
      if (entry.shortCode) {
        unknownCodes.push(entry.shortCode);
      }
      continue;
    }
    rows.push({
      entry,
      card: match.card,
      printing: match.printing,
      zone:
        entry.explicitZone ?? inferZone(match.card.types, match.card.superTypes, entry.sourceSlot),
    });
  }

  return {
    rows,
    unknownCodes,
    totalCards: rows.reduce((sum, row) => sum + row.entry.quantity, 0),
  };
}

export function deckTitle(deck: ResolvedDeck): string {
  const legend = deck.rows.find((row) => row.zone === WellKnown.deckZone.LEGEND);
  if (legend) {
    return legendDisplayName(legend.card);
  }
  const champion = deck.rows.find((row) => row.zone === WellKnown.deckZone.CHAMPION);
  if (champion) {
    return champion.card.name;
  }
  return "Riftbound Deck";
}

/** Discord's hard cap on an embed description. */
const MAX_DESCRIPTION_LENGTH = 4096;

export function deckImportUrl(siteUrl: string, code: string): string {
  return `${siteUrl}/decks/import?code=${encodeURIComponent(code)}`;
}

export function buildDeckEmbed(input: {
  deck: ResolvedDeck;
  code: string;
  snapshot: CatalogSnapshot;
  siteUrl: string;
  imageAttachmentName?: string;
}): APIEmbed {
  const { deck, code, snapshot, siteUrl } = input;

  const rowsByZone = Map.groupBy(deck.rows, (row) => row.zone as string);
  const sections = snapshot.zoneOrder.flatMap((zone) => {
    const rows = rowsByZone.get(zone);
    if (!rows?.length) {
      return [];
    }
    const lines = rows
      .toSorted((a, b) => a.card.name.localeCompare(b.card.name))
      .map((row) => `${row.entry.quantity}× ${row.card.name}`);
    return [`**${snapshot.labels.deckZones[zone]}**\n${lines.join("\n")}`];
  });
  if (deck.unknownCodes.length > 0) {
    sections.push(
      `*${deck.unknownCodes.length} ${deck.unknownCodes.length === 1 ? "card" : "cards"} not in the catalog yet: ${deck.unknownCodes.join(", ")}*`,
    );
  }

  let description = sections.join("\n\n");
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    description = `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }

  return {
    title: deckTitle(deck),
    url: deckImportUrl(siteUrl, code),
    description,
    color: EMBED_COLOR,
    footer: { text: `${deck.totalCards} cards` },
    ...(input.imageAttachmentName
      ? { image: { url: `attachment://${input.imageAttachmentName}` } }
      : {}),
  };
}

export async function fetchDeckImage(
  apiUrl: string,
  deck: ResolvedDeck,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  try {
    const response = await fetchImpl(`${apiUrl}/api/v1/decks/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deckName: deckTitle(deck),
        cards: deck.rows.map((row) => ({
          cardId: row.card.id,
          preferredPrintingId: row.printing.id,
          quantity: row.entry.quantity,
          zone: row.zone,
        })),
      }),
    });
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.error("deck image render failed", error);
    return null;
  }
}
