/**
 * What a user submission actually proposed to change, expressed as field paths.
 *
 * This exists because admin acceptance cannot be attributed to a column. The
 * compare grid puts every provider's value for a field side by side, and the
 * admin clicks whichever cell is nearest. Crediting a contributor by whose cell
 * was clicked would mark them rejected whenever a scraped provider happened to
 * carry the same correct value. So instead we record what differed from the
 * live catalog when they submitted, and ask at review time how much of that the
 * catalog now agrees with.
 *
 * Deliberately not compared: `domains` and `superTypes` (junction tables, no
 * cheap read), `setId` (the candidate stores a set slug, the printing a uuid),
 * and card-level rules/effect text (not `cards` columns). A contributor
 * changing only those resolves as `not_applied`, which understates rather than
 * overstates their credit.
 *
 * Printings are identified by `buildPrintingLinkKey`, the same key the ingest
 * link resolution uses. That module exists because three copies of this key had
 * already drifted apart; this is the fourth caller and it goes through the same
 * function rather than rolling its own.
 */
import { buildPrintingLinkKey } from "../services/candidate-links.js";

/** Live `cards` values a submission can be compared against. */
export interface LiveCardSnapshot {
  name: string;
  /** The denormalized primary type (ADR-037); the junction order is not read. */
  type: string;
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  tags: string[];
}

/** Live `printings` values a submission can be compared against. */
export interface LivePrintingSnapshot {
  rarity: string | null;
  artist: string | null;
  artVariant: string | null;
  size: string | null;
  isSigned: boolean;
  flavorText: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  printedName: string | null;
  language: string | null;
  /** Whether an active front image already exists for this printing. */
  hasImage: boolean;
}

/**
 * The proposed card values, in the shape `candidate_cards` stores them.
 * Optional properties throughout: the insertable column types allow `undefined`
 * for "not provided", which a sparse correction relies on.
 */
export interface ProposedCard {
  name: string;
  types?: string[];
  might?: number | null;
  energy?: number | null;
  power?: number | null;
  mightBonus?: number | null;
  tags?: string[];
}

/** The proposed printing values, in the shape `candidate_printings` stores them. */
export interface ProposedPrinting {
  shortCode: string;
  /** Part of the printing's identity, not a compared field. */
  finish?: string | null;
  /** Part of the printing's identity, not a compared field. */
  markerSlugs?: string[];
  rarity?: string | null;
  artist?: string | null;
  artVariant?: string | null;
  size?: string | null;
  isSigned?: boolean | null;
  flavorText?: string | null;
  printedRulesText?: string | null;
  printedEffectText?: string | null;
  printedName?: string | null;
  language?: string | null;
  imageUrl?: string | null;
}

/** The live side of the comparison; `card` is null for a new-card submission. */
export interface LiveSnapshot {
  card: LiveCardSnapshot | null;
  /**
   * Keyed by {@link buildPrintingLinkKey}, **not** by short code. One short code
   * covers every finish and language of a printing (a card with 4 languages ×
   * 2 finishes has 8 rows all reading `OGN-002`), so a short-code map collapses
   * them onto whichever row was written last. That made every proposed printing
   * compare against an arbitrary sibling: French rows phantom-differed on
   * language against the English row, and an artist fix accepted on one
   * printing went unnoticed because the comparison was against another.
   */
  printings: Map<string, LivePrintingSnapshot>;
}

/**
 * Blank-ish proposals say "I have nothing to offer here", not "make it empty".
 * @param value The proposed value.
 * @returns Whether the submission left this field alone.
 */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Case- and whitespace-insensitive text comparison. A contributor typing
 * "riot games" for "Riot Games" is not proposing a change, and treating it as
 * one would credit them for a correction the admin never made.
 * @param a First value.
 * @param b Second value.
 * @returns Whether the two read as the same text.
 */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * @param a First tag list.
 * @param b Second tag list.
 * @returns Whether both lists hold the same tags, order-insensitively.
 */
function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = a.map((t) => t.toLowerCase()).toSorted();
  const right = b.map((t) => t.toLowerCase()).toSorted();
  return left.every((tag, index) => tag === right[index]);
}

/**
 * Compare one submission against the live catalog.
 *
 * Called twice in a submission's life with the same inputs but a moving live
 * side: once at submit time to record `proposed_diff`, and again at review time
 * to see how much of it the catalog has since adopted.
 *
 * @param proposed The submitted card and its printings, as stored on the candidate rows.
 * @param live The live catalog values, or a null card for a new-card submission.
 * @returns Field paths that differ, e.g. `card.energy`, `printing.OGN-042.artist`.
 */
export function computeProposedDiff(
  proposed: { card: ProposedCard; printings: ProposedPrinting[] },
  live: LiveSnapshot,
): string[] {
  const diff: string[] = [];

  if (live.card === null) {
    // Nothing to compare against: the whole card is the proposal.
    diff.push("card.new");
  } else {
    const liveCard = live.card;
    if (!sameText(proposed.card.name, liveCard.name)) {
      diff.push("card.name");
    }
    const proposedType = proposed.card.types?.[0] ?? null;
    if (!isEmpty(proposedType) && !sameText(proposedType, liveCard.type)) {
      diff.push("card.type");
    }
    const numbers = [
      ["might", proposed.card.might, liveCard.might],
      ["energy", proposed.card.energy, liveCard.energy],
      ["power", proposed.card.power, liveCard.power],
      ["mightBonus", proposed.card.mightBonus, liveCard.mightBonus],
    ] as const;
    for (const [field, proposedValue, liveValue] of numbers) {
      if (!isEmpty(proposedValue) && proposedValue !== liveValue) {
        diff.push(`card.${field}`);
      }
    }
    const proposedTags = proposed.card.tags ?? [];
    if (proposedTags.length > 0 && !sameTags(proposedTags, liveCard.tags)) {
      diff.push("card.tags");
    }
  }

  for (const printing of proposed.printings) {
    // Without a finish the printing cannot be identified among its siblings.
    // Skipping is deliberate: calling it new would add a field that can never
    // be adopted, which pins the submission to not_applied forever.
    if (isEmpty(printing.finish)) {
      continue;
    }
    const key = buildPrintingLinkKey({
      shortCode: printing.shortCode,
      finish: printing.finish ?? "",
      markerSlugs: printing.markerSlugs ?? [],
      language: printing.language ?? null,
    });
    const livePrinting = live.printings.get(key);
    if (!livePrinting) {
      // An unmatched printing is entirely new, whether or not the card exists.
      diff.push(`printing.${key}.new`);
      continue;
    }
    // `language` is absent on purpose: it is part of the key above, so a live
    // match already agrees on it and comparing it can only ever produce noise.
    const texts = [
      ["rarity", printing.rarity, livePrinting.rarity],
      ["artist", printing.artist, livePrinting.artist],
      ["artVariant", printing.artVariant, livePrinting.artVariant],
      ["size", printing.size, livePrinting.size],
      ["flavorText", printing.flavorText, livePrinting.flavorText],
      ["printedRulesText", printing.printedRulesText, livePrinting.printedRulesText],
      ["printedEffectText", printing.printedEffectText, livePrinting.printedEffectText],
      ["printedName", printing.printedName, livePrinting.printedName],
    ] as const;
    for (const [field, proposedValue, liveValue] of texts) {
      if (!isEmpty(proposedValue) && !sameText(proposedValue, liveValue)) {
        diff.push(`printing.${key}.${field}`);
      }
    }
    if (!isEmpty(printing.isSigned) && printing.isSigned !== livePrinting.isSigned) {
      diff.push(`printing.${key}.isSigned`);
    }
    // An image suggestion for a printing that already has artwork proposes a
    // replacement we cannot verify by comparison, so it counts as no change.
    // Those submissions resolve as already_correct unless the admin says
    // otherwise, which is better than crediting an accept that never happened.
    if (!isEmpty(printing.imageUrl) && !livePrinting.hasImage) {
      diff.push(`printing.${key}.image`);
    }
  }

  return diff;
}

/**
 * How much of the original proposal the catalog has since adopted.
 * @param proposedDiff The field paths recorded at submission time.
 * @param currentDiff The same comparison run against the catalog now.
 * @returns The paths that no longer differ.
 */
export function adoptedFields(proposedDiff: string[], currentDiff: string[]): string[] {
  const stillDiffering = new Set(currentDiff);
  return proposedDiff.filter((field) => !stillDiffering.has(field));
}
