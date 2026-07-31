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
 * Everything that distinguishes two printings of one render EXCEPT the
 * finish. Printings sharing a variant key differ only in finish, which no
 * scan can tell apart — the user decides that one.
 *
 * @returns A grouping key over the non-finish printing identity.
 */
function variantKeyOf(printing: Printing): string {
  return [
    printing.shortCode,
    printing.language,
    printing.artVariant,
    printing.size,
    printing.isSigned ? "signed" : "",
    printing.markers
      .map((marker) => marker.slug)
      .toSorted()
      .join("+"),
  ].join("|");
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
 * for the rest); any deeper ambiguity (languages, oversized reprints, signed
 * variants on a shared render) goes to the picker.
 *
 * @returns The resolution the page acts on.
 */
export function resolveLock(
  lock: { key: string; artKey: string; resolved: boolean },
  index: ScanPrintingIndex,
): LockResolution {
  const keys = lock.resolved ? [lock.key] : (index.keysByArtKey.get(lock.artKey) ?? [lock.key]);
  const candidates = [
    ...new Map(
      keys
        .flatMap((key) => index.byImageId.get(key) ?? [])
        .map((printing) => [printing.id, printing] as const),
    ).values(),
  ];
  if (candidates.length === 0) {
    return { kind: "unknown" };
  }
  const groups = Map.groupBy(candidates, variantKeyOf);
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
function sortForPicker(candidates: readonly Printing[]): Printing[] {
  const unique = [...new Map(candidates.map((printing) => [printing.id, printing])).values()];
  return unique.toSorted(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.shortCode.localeCompare(b.shortCode) ||
      a.canonicalRank - b.canonicalRank,
  );
}
