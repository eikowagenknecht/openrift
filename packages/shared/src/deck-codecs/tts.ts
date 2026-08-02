import type { DeckCodeParseResult, DeckImportEntry } from "../deck-code.js";
import { formatHasSideboard } from "../deck-rules.js";
import { zoneExpected } from "../deck-zones.js";
import type { DeckFormat, DeckZone } from "../types/enums.js";
import { WellKnown } from "../well-known.js";
import type { SourceSlot } from "../zone-inference.js";
import type { DeckCodecCard, EncodeResult } from "./types.js";

/**
 * TTS zone order: legend, champion, main, battlefield, runes, sideboard. The
 * format carries no zone markers, so this ordering is the only thing the
 * decoder has to go on.
 */
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

/**
 * Encodes deck cards into TTS (Tabletop Simulator) format: space-separated
 * short codes with each code repeated by its quantity.
 * Output order: legend, champion, main deck, battlefields, runes, sideboard.
 *
 * @returns The encoded TTS string and any warnings.
 */
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

/**
 * Strips the trailing art-variant suffix (e.g. "-1") from a TTS short code.
 * TTS exports codes like "OGN-269-1" but the catalog uses "OGN-269".
 * @returns The short code without the variant suffix.
 */
function stripTTSVariant(token: string): string {
  // Match SET-NNN-V where V is the variant number
  const match = token.match(/^(?<base>[A-Z]+-\d+)-\d+$/u);
  return match ? match[1] : token;
}

/** Formats whose complete-deck layout the decoder recognizes. Freeform has no fixed counts. */
const TTS_LAYOUT_FORMATS: readonly DeckFormat[] = [
  WellKnown.deckFormat.CONSTRUCTED,
  WellKnown.deckFormat.CUSTOM_REGION,
];

/** Zones the TTS stream carries before the sideboard, in encode order. */
const TTS_MAIN_SECTION_ZONES = TTS_ZONE_ORDER.filter(
  (zone) => zone !== WellKnown.deckZone.SIDEBOARD,
);

/**
 * How many tokens a complete deck of this format writes before its sideboard.
 * Constructed is 1 legend + 1 champion + 39 main + 3 battlefields + 12 runes;
 * Custom-Region plays a single battlefield, so it is two shorter.
 * @returns The token count of the format's main section.
 */
function mainSectionSize(format: DeckFormat): number {
  return TTS_MAIN_SECTION_ZONES.reduce(
    (total, zone) => total + (zoneExpected(zone, format) ?? 0),
    0,
  );
}

/** Where the fixed zones sit in a token stream whose length matches a complete deck. */
interface TtsLayout {
  /** Index of the chosen champion (legend first, champion second). */
  championIndex: number;
  /** First index belonging to the sideboard. */
  sideboardStart: number;
}

/**
 * Matches a token count against the complete-deck layouts, so positions are
 * only trusted when they can actually mean what they claim.
 *
 * A stream matches when it is exactly one format's main section (a complete
 * deck with no sideboard) or longer than it in a format that has a sideboard.
 * Anything else is a partially-built deck, a champion-less deck, or a deck
 * missing a card the encoder had to drop, and every index after the gap is
 * shifted, so no position can be trusted.
 *
 * The length is all we have, so one case slips through: a deck that has a
 * sideboard *and* lost a card to the encoder is still longer than the main
 * section, so it decodes one card short and pulls a rune into the sideboard.
 * The export side warns by name about every card it drops, which is the only
 * signal available on that path.
 * @returns The layout to decode against, or null when nothing matches.
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
 * Parses a TTS deck string back into import entries. The format is positional
 * with no zone markers, so zones are recovered from where each token sits —
 * and only when the stream length matches a complete deck. Otherwise every
 * token comes back as main deck and downstream type inference sorts out the
 * legend, runes and battlefields, leaving the champion and sideboard for the
 * review step.
 * @returns Parsed entries and any warnings.
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

  // Build entries preserving positional source slot, then group by shortCode + slot
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
