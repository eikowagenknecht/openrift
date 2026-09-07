import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon } from "lucide-react";
import { useState } from "react";

import { Card as CardPanel } from "@/components/ui/card";
import { CardCountStrip } from "@/features/cards/components/card-count-strip";
import { OwnedCollectionsPopover } from "@/features/cards/components/card-detail/owned-collections-popover";
import { WishlistButton } from "@/features/cards/components/wishlist-heart";
import { AnnotatedDisposeDialog } from "@/features/collections/components/annotated-dispose-dialog";
import { VariantLocationsPopoverHost } from "@/features/collections/components/variant-locations-popover-host";
import { useOwnedCountsForPrintings } from "@/features/collections/hooks/use-owned-count";
import { useQuickAddActions } from "@/features/collections/hooks/use-quick-add-actions";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { useWishEntries } from "@/features/groups/hooks/use-wish-entries";
import { WishlistPickerHost } from "@/features/lists/components/wishlist-picker-host";
import { useUserId } from "@/lib/auth-session";

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

// Every count here comes from a live query with no server snapshot; the card
// page is full-SSR, so this must only ever be mounted behind `useHydrated()`.
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

  const wish = useWishEntries(enabled);
  const [wishTarget, setWishTarget] = useState<Printing | null>(null);

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
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <WishlistButton
            entries={wish.entriesForPrinting(printing.cardId, printing.id)}
            cardName={cardName}
            onAdd={() => setWishTarget(printing)}
            align="end"
          />
          <div className="w-28">
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
        </div>
      </CardPanel>
      <VariantLocationsPopoverHost
        catalogPrintingsByCardId={printingsByCardId}
        languageScopedPrintingsByCardId={printingsByCardId}
        onQuickAdd={quickAdd}
        defaultTargetCollectionId={inbox?.id}
        onAddToCollection={(target, collectionId) =>
          void handleAddToCollection(target, collectionId)
        }
        onRemoveFromCollection={(target, collectionId) =>
          void handleDisposeFromCollection(target, collectionId)
        }
        closeVariants={closeVariants}
      />
      <WishlistPickerHost target={wishTarget} onClose={() => setWishTarget(null)} />
      <AnnotatedDisposeDialog
        pending={pendingAnnotatedDispose}
        onConfirm={() => void confirmAnnotatedDispose()}
        onCancel={cancelAnnotatedDispose}
        isPending={disposeIsPending}
      />
    </>
  );
}
