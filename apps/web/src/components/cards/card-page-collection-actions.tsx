import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon } from "lucide-react";

import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import { AnnotatedDisposeDialog } from "@/components/collection/annotated-dispose-dialog";
import { VariantLocationsPopoverHost } from "@/components/collection/variant-locations-popover-host";
import { Card as CardPanel } from "@/components/ui/card";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";

/**
 * The sentence above the +/- strip: how many of the shown printing the viewer
 * owns, and the card-wide figure when it differs (so owning a different
 * printing doesn't read as owning nothing).
 * @returns The owned-copies summary sentence.
 */
export function ownedSummary(ownedCount: number, cardTotal: number): string {
  if (cardTotal === 0) {
    return "You don't own this card yet.";
  }
  if (ownedCount === 0) {
    return `You own ${cardTotal} of this card, none of this printing.`;
  }
  if (cardTotal > ownedCount) {
    return `You own ${ownedCount} of this printing, ${cardTotal} of this card.`;
  }
  return ownedCount === 1
    ? "You own 1 copy of this printing."
    : `You own ${ownedCount} copies of this printing.`;
}

/**
 * Owned count and +/- for the printing the card page is showing, so a signed-in
 * visitor can record the card here instead of detouring to /collections.
 *
 * Adds go to the inbox, the same default target the catalog's quick-add palette
 * uses. A minus removes the newest bare copy; when the copies span several
 * collections it escalates to the variant×collection popover so the viewer
 * picks the row.
 *
 * Every count here comes from a live query, which has no server snapshot. The
 * card page is a full-SSR route, so this must only ever be mounted behind
 * `useHydrated()`.
 * @returns The collection panel.
 */
export function CardPageCollectionActions({
  printing,
  siblings,
}: {
  printing: Printing;
  siblings: readonly Printing[];
}) {
  const userId = useUserId();
  const enabled = Boolean(userId);
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled,
  });
  const inbox = collections?.find((collection) => collection.isInbox);
  const {
    handleQuickAdd,
    handleAddToCollection,
    tryUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
    pendingAnnotatedDispose,
    confirmAnnotatedDispose,
    cancelAnnotatedDispose,
    disposeIsPending,
  } = useQuickAddActions(inbox?.id);

  const siblingIds = siblings.map((sibling) => sibling.id);
  const { data: counts } = useOwnedCountsForPrintings(siblingIds, enabled);
  const ownedCount = counts?.totals[printing.id] ?? 0;
  const cardTotal = counts?.total ?? 0;
  const cardName = legendDisplayName(printing.card);

  const removeCopy = (anchorEl: HTMLElement) => {
    void (async () => {
      const result = await tryUndoAdd?.(printing);
      if (result === "ambiguous" && handleOpenVariants) {
        handleOpenVariants(printing, anchorEl, "remove", false, true);
      }
    })();
  };

  const addCopy = () => {
    if (handleQuickAdd) {
      void handleQuickAdd(printing);
    }
  };

  const quickAdd = handleQuickAdd ? (target: Printing) => void handleQuickAdd(target) : undefined;
  const printingsByCardId = new Map([[printing.cardId, [...siblings]]]);

  return (
    <>
      <CardPanel className="flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <PackageIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">{ownedSummary(ownedCount, cardTotal)}</p>
        </div>
        <div className="w-28 shrink-0 self-start sm:self-auto">
          <CardCountStrip
            count={ownedCount}
            totalCount={cardTotal}
            pillOverride={
              ownedCount > 0 ? (
                <OwnedCollectionsPopover
                  printingId={printing.id}
                  cardName={cardName}
                  shortCode={printing.shortCode}
                  count={ownedCount}
                  totalCount={cardTotal}
                  siblings={siblings.length > 1 ? siblings : undefined}
                />
              ) : undefined
            }
            decrement={
              ownedCount > 0
                ? {
                    onClick: (event) => removeCopy(event.currentTarget),
                    ariaLabel: `Remove ${cardName}`,
                  }
                : undefined
            }
            increment={{
              onClick: addCopy,
              disabled: !handleQuickAdd,
              ariaLabel: inbox ? `Add ${cardName} to ${inbox.name}` : `Add ${cardName}`,
            }}
          />
        </div>
      </CardPanel>
      <VariantLocationsPopoverHost
        catalogPrintingsByCardId={printingsByCardId}
        languageScopedPrintingsByCardId={printingsByCardId}
        onQuickAdd={quickAdd}
        defaultTargetCollectionId={inbox?.id}
        onAddToCollection={handleAddToCollection}
        onRemoveFromCollection={handleDisposeFromCollection}
        closeVariants={closeVariants}
      />
      <AnnotatedDisposeDialog
        pending={pendingAnnotatedDispose}
        onConfirm={() => void confirmAnnotatedDispose()}
        onCancel={cancelAnnotatedDispose}
        isPending={disposeIsPending}
      />
    </>
  );
}
