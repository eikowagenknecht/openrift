/**
 * What a user submission actually proposed to change, expressed as field paths.
 *
 * Not compared: `domains`/`superTypes` (junction tables), `setId` (slug vs uuid),
 * and rules/effect text (not `cards` columns).
 *
 * Printings are identified by `buildPrintingLinkKey`; do not hand-roll this key.
 */
import { buildPrintingLinkKey } from "../../../lib/printing-link-key.js";
import type { ProposedCard, ProposedPrinting } from "../repositories/candidate-cards-review.js";
import type { LiveSnapshot } from "../repositories/card-submissions.js";

/** Blank-ish proposals say "I have nothing to offer here", not "make it empty". */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Case- and whitespace-insensitive: a contributor typing "riot games" for
 * "Riot Games" is not proposing a change, and treating it as one would credit
 * them for a correction the admin never made.
 */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = a.map((t) => t.toLowerCase()).toSorted();
  const right = b.map((t) => t.toLowerCase()).toSorted();
  return left.every((tag, index) => tag === right[index]);
}

/**
 * Compare one submission against the live catalog, returning the field paths
 * that differ (e.g. `card.energy`, `printing.OGN-042.artist`).
 *
 * Called twice in a submission's life with the same inputs but a moving live
 * side: once at submit time to record `proposed_diff`, and again at review time
 * to see how much of it the catalog has since adopted.
 */
export function computeProposedDiff(
  proposed: { card: ProposedCard; printings: ProposedPrinting[] },
  live: LiveSnapshot,
): string[] {
  const diff: string[] = [];

  if (live.card === null) {
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
    if (
      !isEmpty(printing.isOvernumbered) &&
      printing.isOvernumbered !== livePrinting.isOvernumbered
    ) {
      diff.push(`printing.${key}.isOvernumbered`);
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

export function adoptedFields(proposedDiff: string[], currentDiff: string[]): string[] {
  const stillDiffering = new Set(currentDiff);
  return proposedDiff.filter((field) => !stillDiffering.has(field));
}
