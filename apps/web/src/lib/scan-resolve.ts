import type { Printing } from "@openrift/shared";

import type { LoadedScanBank } from "@/lib/scan-bank";

/**
 * Lookup tables from scan-bank keys to catalog printings. Bank keys are image
 * ids (printings sharing a render share the key), so one key can map to
 * several printings — most commonly the normal/foil pair of a common.
 */
export interface ScanPrintingIndex {
  byImageId: Map<string, Printing[]>;
  /** All bank keys belonging to one artwork, for unresolved locks. */
  keysByArtKey: Map<string, string[]>;
}

/**
 * Build the lock-to-printing lookup for a loaded bank.
 *
 * @returns The index; build it once per catalog/bank pair, not per lock.
 */
export function buildScanPrintingIndex(
  allPrintings: readonly Printing[],
  loaded: LoadedScanBank,
): ScanPrintingIndex {
  const byImageId = new Map<string, Printing[]>();
  for (const printing of allPrintings) {
    for (const image of printing.images) {
      const list = byImageId.get(image.imageId);
      if (list) {
        list.push(printing);
      } else {
        byImageId.set(image.imageId, [printing]);
      }
    }
  }
  const keysByArtKey = new Map<string, string[]>();
  for (const [key, artKey] of loaded.artKeys) {
    const list = keysByArtKey.get(artKey);
    if (list) {
      list.push(key);
    } else {
      keysByArtKey.set(artKey, [key]);
    }
  }
  return { byImageId, keysByArtKey };
}

/**
 * Everything that distinguishes two printings of one render EXCEPT the finish,
 * the language and the markers. Printings sharing this key are the same card
 * from the same set at the same size, and only the three things the resolver
 * decides on its own separate them.
 *
 * @returns A grouping key over the printing identity the resolver never
 *   guesses at.
 */
function baseKeyOf(printing: Printing): string {
  return [
    printing.shortCode,
    printing.artVariant,
    printing.size,
    printing.isSigned ? "signed" : "",
  ].join("|");
}

/**
 * The printing's markers (promo stamps and the like) as a stable key part.
 *
 * @returns The marker slugs, sorted and joined.
 */
function markerKeyOf(printing: Printing): string {
  return printing.markers
    .map((marker) => marker.slug)
    .toSorted()
    .join("+");
}

/**
 * Everything that distinguishes two printings of one render EXCEPT the finish
 * and the language. The language-preference shortcut auto-picks between
 * printings sharing this key: they are the same physical variant printed in
 * several languages, so the user's stated card language decides.
 *
 * @returns A grouping key over the non-finish, non-language printing identity.
 */
function languageAgnosticKeyOf(printing: Printing): string {
  return [baseKeyOf(printing), markerKeyOf(printing)].join("|");
}

/**
 * Everything that distinguishes two printings of one render EXCEPT the
 * finish. Printings sharing a variant key differ only in finish, which no
 * scan can tell apart — the user decides that one.
 *
 * @returns A grouping key over the non-finish printing identity.
 */
function variantKeyOf(printing: Printing): string {
  return [printing.language, languageAgnosticKeyOf(printing)].join("|");
}

/**
 * The finish the scanner adds by default when a render exists in several:
 * normal when the group has one (user decision — foil is the exception, not
 * the default), otherwise the group's canonical printing.
 *
 * @returns The default printing of a same-variant finish group.
 */
function defaultOfFinishGroup(group: readonly Printing[]): Printing {
  const normal = group.find((printing) => printing.finish === "normal");
  if (normal) {
    return normal;
  }
  return group.toSorted((a, b) => a.canonicalRank - b.canonicalRank)[0];
}

/**
 * Drop the marked printings when markers are all that is left to decide.
 *
 * Reading a promo stamp off the card is the disambiguation stage's job, and it
 * reports one when it sees one; the case that reaches here is the one where it
 * saw nothing, which for a stamped printing it would not have. So an unstamped
 * card is what the frame showed, and the plain printing is the answer — the
 * same call the resolver already makes for foils, where an unremarkable card is
 * the common case and the exception is one tap away in the tray.
 *
 * Only ever fires when the markers are the sole difference: a marked variant
 * from another set, size or art still opens the picker.
 *
 * @returns The unmarked candidates, or the input untouched when markers were
 *   not the whole difference.
 */
function withoutMarkerOnlyVariants(candidates: readonly Printing[]): readonly Printing[] {
  if (Map.groupBy(candidates, baseKeyOf).size > 1) {
    return candidates;
  }
  const plain = candidates.filter((printing) => printing.markers.length === 0);
  return plain.length > 0 ? plain : candidates;
}

/**
 * Swap the engine's language pick for the user's stated one.
 *
 * Only ever swaps within the same physical variant: the preferred-language
 * printings have to sit on the same {@link languageAgnosticKeyOf} as the ones
 * the engine named, so a card that simply does not exist in that language
 * keeps the engine's answer.
 *
 * @returns The candidates to resolve, in the preferred language where one
 *   exists for the same variant.
 */
function inPreferredLanguage(
  picked: readonly Printing[],
  artwork: readonly Printing[],
  preferredLanguage: string,
): Printing[] {
  if (picked.some((printing) => printing.language === preferredLanguage)) {
    return [...picked];
  }
  const variants = new Set(picked.map((printing) => languageAgnosticKeyOf(printing)));
  const swapped = artwork.filter(
    (printing) =>
      printing.language === preferredLanguage && variants.has(languageAgnosticKeyOf(printing)),
  );
  return swapped.length > 0 ? swapped : [...picked];
}

/** How the page should handle one lock. */
export type LockResolution =
  | {
      /** Add `printing` right away; `finishSiblings` feed the tray's finish switch. */
      kind: "auto";
      printing: Printing;
      finishSiblings: Printing[];
    }
  | {
      /** The engine (or the catalog) could not settle on one variant — the user picks. */
      kind: "picker";
      candidates: Printing[];
    }
  | {
      /** The bank knows a render the catalog does not — nothing to add. */
      kind: "unknown";
    };

/**
 * Map a lock from the scan engine to the printing(s) it stands for.
 *
 * A resolved lock names one render; an unresolved one (foils, unsplittable
 * languages — and every single-render artwork, whose disambiguation stage
 * never runs) widens to every render of the locked artwork. Either way, if
 * the candidates differ only by finish the normal one auto-adds (tray switch
 * for the rest), and so does the unmarked one when a promo stamp is the only
 * other difference (see {@link withoutMarkerOnlyVariants}). Any deeper
 * ambiguity (oversized reprints, signed variants on a shared render) goes to
 * the picker.
 *
 * A stated card language outranks the engine on language, both ways round.
 * On an unresolved lock it settles a language-only ambiguity instead of
 * paying a picker for every abstention, and on a resolved one it overrides
 * the pick: the language read works off a few rows of glyphs, it has no way
 * to abstain once it has committed, and someone who has said their cards are
 * English does not want Simplified Chinese in their collection. Mixed stacks
 * pass no preference and keep the engine's read.
 *
 * @returns The resolution the page acts on.
 */
export function resolveLock(
  lock: { key: string; artKey: string; resolved: boolean },
  index: ScanPrintingIndex,
  preferredLanguage?: string,
): LockResolution {
  const artKeys = index.keysByArtKey.get(lock.artKey) ?? [lock.key];
  const printingsFor = (keys: readonly string[]) => [
    ...new Map(
      keys
        .flatMap((key) => index.byImageId.get(key) ?? [])
        .map((printing) => [printing.id, printing] as const),
    ).values(),
  ];
  let candidates = printingsFor(lock.resolved ? [lock.key] : artKeys);
  if (candidates.length === 0) {
    return { kind: "unknown" };
  }
  if (lock.resolved && preferredLanguage !== undefined) {
    candidates = inPreferredLanguage(candidates, printingsFor(artKeys), preferredLanguage);
  }
  // Narrowed in two steps, markers before language, so a card that exists
  // plain and stamped in several languages settles both at once.
  let narrowed: readonly Printing[] = candidates;
  if (Map.groupBy(narrowed, variantKeyOf).size > 1) {
    narrowed = withoutMarkerOnlyVariants(narrowed);
  }
  if (preferredLanguage !== undefined && Map.groupBy(narrowed, variantKeyOf).size > 1) {
    const agnosticGroups = Map.groupBy(narrowed, languageAgnosticKeyOf);
    const preferred = narrowed.filter((printing) => printing.language === preferredLanguage);
    // Only the language (and finish) separates the candidates, and the
    // preferred language is among them — that is the user's answer.
    if (agnosticGroups.size === 1 && preferred.length > 0) {
      narrowed = preferred;
    }
  }
  const groups = Map.groupBy(narrowed, variantKeyOf);
  if (groups.size > 1) {
    // More than finish separates the candidates — the scan cannot know which
    // physical variant is in hand.
    return { kind: "picker", candidates: sortForPicker(candidates) };
  }
  const group = [...groups.values()][0];
  const printing = defaultOfFinishGroup(group);
  return {
    kind: "auto",
    printing,
    finishSiblings: group.filter((sibling) => sibling.id !== printing.id),
  };
}

/**
 * The other finishes of a printing's render, for the tray's finish switch.
 *
 * @returns Same-variant printings that differ only in finish, excluding the
 *   given one.
 */
export function finishSiblingsOf(printing: Printing, index: ScanPrintingIndex): Printing[] {
  const imageIds = new Set(printing.images.map((image) => image.imageId));
  const variantKey = variantKeyOf(printing);
  const siblings: Printing[] = [];
  const seen = new Set<string>([printing.id]);
  for (const imageId of imageIds) {
    for (const candidate of index.byImageId.get(imageId) ?? []) {
      if (!seen.has(candidate.id) && variantKeyOf(candidate) === variantKey) {
        seen.add(candidate.id);
        siblings.push(candidate);
      }
    }
  }
  return siblings;
}

/**
 * Stable picker order: language, then set code, then finish (normal first
 * via canonical rank).
 *
 * @returns The candidates, sorted for display.
 */
export function sortForPicker(candidates: readonly Printing[]): Printing[] {
  const unique = [...new Map(candidates.map((printing) => [printing.id, printing])).values()];
  return unique.toSorted(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.shortCode.localeCompare(b.shortCode) ||
      a.canonicalRank - b.canonicalRank,
  );
}
