import type { Printing } from "@openrift/shared";

import type { LoadedScanBank } from "@/lib/scan-bank";

/**
 * Bank keys are image ids; printings sharing a render share a key, so one key
 * can map to several printings.
 */
export interface ScanPrintingIndex {
  byImageId: Map<string, Printing[]>;
  /** All bank keys belonging to one artwork, for unresolved locks. */
  keysByArtKey: Map<string, string[]>;
}

/** Build once per catalog/bank pair, not per lock. */
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
 * Key over everything except finish, language, and markers: the three things
 * the resolver decides on its own.
 */
function baseKeyOf(printing: Printing): string {
  return [
    printing.shortCode,
    printing.artVariant,
    printing.size,
    printing.isSigned ? "signed" : "",
    printing.isOvernumbered ? "overnumbered" : "",
  ].join("|");
}

function markerKeyOf(printing: Printing): string {
  return printing.markers
    .map((marker) => marker.slug)
    .toSorted()
    .join("+");
}

/**
 * Key over everything except finish and language: printings sharing it are
 * the same physical variant printed in several languages.
 */
function languageAgnosticKeyOf(printing: Printing): string {
  return [baseKeyOf(printing), markerKeyOf(printing)].join("|");
}

/** Printings sharing a variant key differ only in finish, which no scan can tell apart. */
function variantKeyOf(printing: Printing): string {
  return [printing.language, languageAgnosticKeyOf(printing)].join("|");
}

/** Normal, when the group has one; otherwise the group's canonical printing. */
function defaultOfFinishGroup(group: readonly Printing[]): Printing {
  const normal = group.find((printing) => printing.finish === "normal");
  if (normal) {
    return normal;
  }
  const [canonical] = group.toSorted((a, b) => a.canonicalRank - b.canonicalRank);
  if (canonical === undefined) {
    throw new Error("scan-resolve: finish group is empty");
  }
  return canonical;
}

/**
 * Drops marked printings when markers are the sole difference: the
 * disambiguation stage already reports a marker when it sees one.
 */
function withoutMarkerOnlyVariants(candidates: readonly Printing[]): readonly Printing[] {
  if (Map.groupBy(candidates, baseKeyOf).size > 1) {
    return candidates;
  }
  const plain = candidates.filter((printing) => printing.markers.length === 0);
  return plain.length > 0 ? plain : candidates;
}

/**
 * Swaps within the same {@link languageAgnosticKeyOf} only; a card that does
 * not exist in the preferred language keeps the engine's answer.
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
 * A stated card language overrides the engine's pick on a resolved lock and
 * breaks ties on an unresolved one; no preference keeps the engine's read.
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
  // Markers must narrow before language, or a card plain and stamped in
  // several languages would not settle both at once.
  let narrowed: readonly Printing[] = candidates;
  if (Map.groupBy(narrowed, variantKeyOf).size > 1) {
    narrowed = withoutMarkerOnlyVariants(narrowed);
  }
  if (preferredLanguage !== undefined && Map.groupBy(narrowed, variantKeyOf).size > 1) {
    const agnosticGroups = Map.groupBy(narrowed, languageAgnosticKeyOf);
    const preferred = narrowed.filter((printing) => printing.language === preferredLanguage);
    if (agnosticGroups.size === 1 && preferred.length > 0) {
      narrowed = preferred;
    }
  }
  const groups = Map.groupBy(narrowed, variantKeyOf);
  const [group] = [...groups.values()];
  if (groups.size > 1 || group === undefined) {
    return { kind: "picker", candidates: sortForPicker(candidates) };
  }
  const printing = defaultOfFinishGroup(group);
  return {
    kind: "auto",
    printing,
    finishSiblings: group.filter((sibling) => sibling.id !== printing.id),
  };
}

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

/** Stable picker order: language, then set code, then finish (normal first via canonical rank). */
export function sortForPicker(candidates: readonly Printing[]): Printing[] {
  const unique = [...new Map(candidates.map((printing) => [printing.id, printing])).values()];
  return unique.toSorted(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.shortCode.localeCompare(b.shortCode) ||
      a.canonicalRank - b.canonicalRank,
  );
}
