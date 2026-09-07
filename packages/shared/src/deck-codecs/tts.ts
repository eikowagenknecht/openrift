import type { DeckCodeParseResult, DeckImportEntry } from "../deck-code.js";
import { formatHasSideboard } from "../deck-rules.js";
import { zoneExpected } from "../deck-zones.js";
import type { DeckFormat, DeckZone } from "../types/enums.js";
import { WellKnown } from "../well-known.js";
import type { SourceSlot } from "../zone-inference.js";
import type { DeckCodecCard, EncodeResult } from "./types.js";

/** The format carries no zone markers, so this ordering is the only thing the decoder has to go on. */
const TTS_ZONE_ORDER: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.SIDEBOARD,
];

const TTS_ZONE_RANK: Record<string, number> = Object.fromEntries(
  TTS_ZONE_ORDER.map((zone, index) => [zone, index]),
);

/** TTS (Tabletop Simulator) format: space-separated short codes, each repeated by its quantity. */
export function encodeTTS(cards: DeckCodecCard[]): EncodeResult {
  const warnings: string[] = [];
  const codes: string[] = [];

  const sorted = cards.toSorted(
    (cardA, cardB) => (TTS_ZONE_RANK[cardA.zone] ?? 99) - (TTS_ZONE_RANK[cardB.zone] ?? 99),
  );

  for (const card of sorted) {
    if (card.zone === WellKnown.deckZone.OVERFLOW) {
      continue;
    }

    if (!card.shortCode) {
      warnings.push(`Skipped card ${card.cardId}: no canonical printing found`);
      continue;
    }

    for (let index = 0; index < card.quantity; index++) {
      codes.push(`${card.shortCode}-1`);
    }
  }

  return { code: codes.join(" "), warnings };
}

/** TTS exports codes like "OGN-269-1" but the catalog uses "OGN-269". */
function stripTTSVariant(token: string): string {
  const match = /^(?<base>[A-Z]+-\d+)-\d+$/u.exec(token);
  return match ? match[1] : token;
}

/** Formats whose complete-deck layout the decoder recognizes. Freeform has no fixed counts. */
const TTS_LAYOUT_FORMATS: readonly DeckFormat[] = [
  WellKnown.deckFormat.CONSTRUCTED,
  WellKnown.deckFormat.CUSTOM_REGION,
];

const TTS_MAIN_SECTION_ZONES = TTS_ZONE_ORDER.filter(
  (zone) => zone !== WellKnown.deckZone.SIDEBOARD,
);

/**
 * Constructed is 1 legend + 1 champion + 39 main + 3 battlefields + 12 runes;
 * Custom-Region plays a single battlefield, so it is two shorter.
 */
function mainSectionSize(format: DeckFormat): number {
  return TTS_MAIN_SECTION_ZONES.reduce(
    (total, zone) => total + (zoneExpected(zone, format) ?? 0),
    0,
  );
}

/** Where the fixed zones sit in a token stream whose length matches a complete deck. */
interface TtsLayout {
  championIndex: number;
  sideboardStart: number;
}

/**
 * A deck with a sideboard that also drops a card to the encoder still exceeds
 * the main-section length, so it decodes one card short; only the encoder's warning surfaces it.
 */
function resolveTtsLayout(tokenCount: number): TtsLayout | null {
  let best: number | null = null;
  for (const format of TTS_LAYOUT_FORMATS) {
    const size = mainSectionSize(format);
    const matches = tokenCount === size || (tokenCount > size && formatHasSideboard(format));
    if (matches && (best === null || size > best)) {
      best = size;
    }
  }
  return best === null ? null : { championIndex: 1, sideboardStart: best };
}

const TTS_SLOT_LABELS: Record<SourceSlot, string> = {
  mainDeck: "Main Deck",
  chosenChampion: "Chosen Champion",
  sideboard: "Sideboard",
};

/**
 * Zones are recovered from where each token sits, only when the stream length
 * matches a complete deck. Otherwise every token comes back as mainDeck.
 */
export function parseTTSFormat(code: string): DeckCodeParseResult {
  const warnings: string[] = [];
  const tokens = code.split(/\s+/u).filter((token) => token !== "");
  const layout = resolveTtsLayout(tokens.length);
  if (!layout && tokens.length > 0) {
    warnings.push(
      "TTS exports don't record zones, and this deck doesn't match a complete deck layout. The chosen champion and sideboard weren't detected, so set the zones for those cards before importing.",
    );
  }

  const slotForIndex = (index: number): SourceSlot => {
    if (!layout) {
      return "mainDeck";
    }
    if (index === layout.championIndex) {
      return "chosenChampion";
    }
    return index >= layout.sideboardStart ? "sideboard" : "mainDeck";
  };

  const grouped = new Map<
    string,
    { shortCode: string; sourceSlot: SourceSlot; quantity: number }
  >();

  for (const [index, token] of tokens.entries()) {
    const shortCode = stripTTSVariant(token);
    const sourceSlot = slotForIndex(index);
    const key = `${shortCode}::${sourceSlot}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, { shortCode, sourceSlot, quantity: 1 });
    }
  }

  const entries: DeckImportEntry[] = [...grouped.values()].map(
    ({ shortCode, sourceSlot, quantity }) => ({
      shortCode,
      quantity,
      sourceSlot,
      explicitZone: sourceSlot === "chosenChampion" ? WellKnown.deckZone.CHAMPION : undefined,
      rawFields: { "Source Code": shortCode, Slot: TTS_SLOT_LABELS[sourceSlot] },
    }),
  );

  return { entries, warnings };
}
