import type { CardTradeLiveAnnotation, CopyResponse, Printing } from "@openrift/shared";

import { collapseTradeAnnotations, groupTradeAnnotationsByPrinting } from "@/lib/trade-derivation";
import { liveTradeStatus, tradeStatusTitle } from "@/lib/trade-status-labels";

// What a /collections tile shows about the live trades touching it. Kept out of
// the cell component so the rules below are testable without rendering a grid.

/** The live-trade marker one collection tile carries. */
export interface TileTradeStatus {
  /** The annotation the chip is drawn from (the printing's most committed one). */
  annotation: CardTradeLiveAnnotation;
  /** Copies in the same state across the tile's sibling printings, when that diverges from the annotation's own count. */
  totalCount?: number;
  /** The chip's tooltip. */
  title: string;
}

/**
 * The tooltip for a tile's trade chip.
 *
 * Every state but a giver-side `asked` defers to the shared summary, so a chip
 * reads the same here as anywhere else. `asked` is the one the annotation
 * cannot explain by itself: its number counts copies other people have bid
 * for, and nothing is promised yet, so a bare "Requested 3" invites the
 * reading "3 of mine are spoken for". Naming the copies still free alongside
 * it settles that without a second chip.
 *
 * The word "copies" is load-bearing. The bare number reads just as easily as a
 * headcount of the people asking, which is a different figure (one person can
 * ask for several), so it says what it counts.
 * @param annotation The tile's collapsed annotation.
 * @param totalCount Copies in the same state across sibling printings, when it diverges.
 * @param availableCount Copies of this printing the viewer could still promise.
 * @returns The tooltip sentence.
 */
export function tradeChipTitle({
  annotation,
  totalCount,
  availableCount,
}: {
  annotation: CardTradeLiveAnnotation;
  totalCount?: number;
  availableCount: number;
}): string {
  const { label, direction } = liveTradeStatus(annotation);
  if (annotation.role !== "giver" || annotation.phase !== "asked") {
    return tradeStatusTitle({ label, direction, count: annotation.quantity, totalCount });
  }
  const wanted =
    annotation.quantity === 1 ? "1 copy wanted" : `${annotation.quantity} copies wanted`;
  return `${label} (${direction}) · ${wanted}, ${availableCount} available`;
}

/**
 * Copies of one printing the viewer still holds free: their own rows minus the
 * pinned ones and the ones out on a loan.
 *
 * **What this number means.** "Copies you still hold free", not "copies the
 * server would let you reserve". The two are not the same and cannot be made
 * so from here: the server builds reservable supply from copies actually
 * offered on a shared tradelist, while this counts every copy in the
 * collection. A copy on no tradelist inflates this figure and no client-side
 * rule can tell, so the honest frame is what the user physically has.
 *
 * That frame is what decides the subtractions, so read it before adding one.
 * A `reserved` copy is promised to someone (ADR-019) and a loaned one is out
 * of the viewer's hands (ADR-039). Both are gone as far as the user is
 * concerned, so both come off. Do not drop either: a printing whose one free
 * copy is out on loan would read "1 available" while an accept refused the
 * same stack with "Only 0 copies are still available".
 *
 * **`altered` is deliberately not subtracted**, even though `buildSupply` in
 * `apps/api/src/repositories/friend-group-matches.ts` drops it alongside the
 * other two. That exclusion is a matching policy, not a fact about the card:
 * the matcher won't volunteer a signed or painted copy against a wish, because
 * a wish means the clean card. The copy is still sitting in the binder and its
 * owner can hand it over in a trade they arrange themselves. Telling them they
 * hold zero free copies while one is in front of them would be wrong in a more
 * irritating way than counting one the matcher happens to skip.
 *
 * Read from the copies feed, which already carries the flags per copy, so
 * nothing here costs a request.
 * @param copies The cell's copy rows (undefined while the live query loads).
 * @param printingId The printing being counted.
 * @returns The count of copies the viewer still holds free.
 */
export function availableCopyCount(
  copies: readonly CopyResponse[] | undefined,
  printingId: string,
): number {
  return (copies ?? []).filter(
    (copy) => copy.printingId === printingId && !copy.reserved && !copy.onLoan,
  ).length;
}

/**
 * The live-trade marker for one collection tile, or null when it shows none.
 *
 * The annotation is the source of truth here, not the copies' `reserved` flag:
 * a stacked tile is a printing rather than a copy, and only the annotation
 * carries the phase that decides the word. (`reserved` stays true after the
 * cards change hands, until the giver applies their sync, so it cannot tell
 * "Reserved" from "Traded" on its own.)
 *
 * @param annotations The viewer's live annotations across every printing, or undefined while loading.
 * @param copies The cell's copy rows, for the available-copies figure.
 * @param printingId The printing on display (after any sibling swap).
 * @param siblingIds Every printing the tile covers: the card's siblings in cards view, else just the one.
 * @param withSiblingTotal True in cards view, where one tile folds sibling printings together.
 * @param isGroupCollection True when the tile's copies belong to a group "bulk box".
 * @returns The marker, or null when the tile shows none.
 */
export function tileTradeStatus({
  annotations,
  copies,
  printingId,
  siblingIds,
  withSiblingTotal,
  isGroupCollection,
}: {
  annotations: readonly CardTradeLiveAnnotation[] | undefined;
  copies: readonly CopyResponse[] | undefined;
  printingId: string;
  siblingIds: readonly string[];
  withSiblingTotal: boolean;
  isGroupCollection: boolean;
}): TileTradeStatus | null {
  // A trade pins the viewer's own copies, and an annotation names a printing
  // with no collection in it. On a group "bulk box" the tile's copies belong to
  // the group, so any annotation on this printing describes copies sitting in a
  // personal collection somewhere else, not these. Both roles are wrong there:
  // an incoming card is one arriving in the viewer's own collection, which is
  // as misplaced on a group tile as an outgoing one.
  if (isGroupCollection) {
    return null;
  }
  // Narrow to the tile's own printings before grouping. The viewer's whole live
  // set would otherwise be regrouped once per visible tile.
  const byPrinting = groupTradeAnnotationsByPrinting(
    (annotations ?? []).filter((entry) => siblingIds.includes(entry.printingId)),
  );
  const annotation = collapseTradeAnnotations(byPrinting.get(printingId) ?? []);
  if (!annotation) {
    return null;
  }
  // Cards view folds sibling printings into one tile, so the chip also reports
  // the card-wide figure. Only annotations in the winning role and phase count
  // toward it: summing the card would put copies merely asked for behind a
  // "Reserved" word, which is the one thing this marker exists to prevent.
  const totalCount = withSiblingTotal
    ? [...byPrinting.values()]
        .flat()
        .filter((entry) => entry.role === annotation.role && entry.phase === annotation.phase)
        .reduce((sum, entry) => sum + entry.quantity, 0)
    : undefined;
  return {
    annotation,
    totalCount,
    title: tradeChipTitle({
      annotation,
      totalCount,
      availableCount: availableCopyCount(copies, printingId),
    }),
  };
}

/**
 * The live-trade annotation that supplies the wording for each copy on a tile,
 * keyed by copy id. For the copy-details dialog, whose rows are individual
 * copies spanning one or more printings.
 *
 * It says nothing about which copies are pinned. That is each copy's own
 * `reserved` flag, which every consumer checks before showing anything. What
 * the flag cannot give is the word, since it stays true after the cards change
 * hands until the giver applies their sync, so only the phase separates
 * "Reserved" from "Traded".
 * @param annotations The viewer's live annotations, or undefined while loading.
 * @param printingByCopyId The tile's copies and the printing each belongs to.
 * @returns Copy id to its printing's most committed annotation, omitting copies whose printing has none.
 */
export function tradeAnnotationByCopyId(
  annotations: readonly CardTradeLiveAnnotation[] | undefined,
  printingByCopyId: ReadonlyMap<string, Printing>,
): Map<string, CardTradeLiveAnnotation> {
  const byPrinting = groupTradeAnnotationsByPrinting(annotations ?? []);
  const byCopy = new Map<string, CardTradeLiveAnnotation>();
  for (const [copyId, printing] of printingByCopyId) {
    const annotation = collapseTradeAnnotations(byPrinting.get(printing.id) ?? []);
    if (annotation) {
      byCopy.set(copyId, annotation);
    }
  }
  return byCopy;
}
