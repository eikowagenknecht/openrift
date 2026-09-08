import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { Marketplace } from "@openrift/shared/types/pricing";

import { CollectionTopBar } from "@/features/collections/components/collection-top-bar";
import { useSetCollectionDeckbuilding } from "@/features/collections/hooks/use-collections";
import { aggregatePersonalCollectionValue } from "@/features/collections/lib/collection-value";
import { isTempCopyId } from "@/features/collections/lib/temp-copy-id";
import { useCollectionOverlayStore } from "@/features/collections/stores/collection-overlay-store";
import { formatterForMarketplace } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-config";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

interface CollectionGridTopBarProps {
  title: string;
  collections: CollectionResponse[];
  currentCollection: CollectionResponse | undefined;
  mode: "browse" | "select";
  view: "cards" | "printings" | "copies";
  favoriteMarketplace: Marketplace;
  addTarget: string | undefined;
  isEmpty: boolean;
  hasCards: boolean;
  selectableCopyIds: string[];
  selectedCount: number;
  onToggleSidebar: () => void;
  onSelectAll: () => void;
  onEnterSelect: () => void;
  onExitSelect: () => void;
}

export function CollectionGridTopBar({
  title,
  collections,
  currentCollection,
  mode,
  view,
  favoriteMarketplace,
  addTarget,
  isEmpty,
  hasCards,
  selectableCopyIds,
  selectedCount,
  onToggleSidebar,
  onSelectAll,
  onEnterSelect,
  onExitSelect,
}: CollectionGridTopBarProps) {
  const setDeckbuilding = useSetCollectionDeckbuilding();

  const formatValue = formatterForMarketplace(favoriteMarketplace);
  // Excludes shared group collections: their copies are communal, not the
  // viewer's own.
  const aggregate = aggregatePersonalCollectionValue(collections);
  const valueCents = currentCollection ? currentCollection.totalValueCents : aggregate.valueCents;
  const unpricedCount = currentCollection
    ? currentCollection.unpricedCopyCount
    : aggregate.unpricedCount;

  // Excludes optimistic temp copies, mirroring what `toggleSelectAll` can
  // actually select.
  const selectableRealCount = selectableCopyIds.filter((id) => !isTempCopyId(id)).length;

  const canAdminCollection = Boolean(currentCollection?.viewerCanAdmin);
  const canDeleteCollection = Boolean(
    currentCollection && !currentCollection.isInbox && canAdminCollection,
  );
  const canClearInbox = Boolean(currentCollection?.isInbox && canAdminCollection);

  const collectionShareUrl =
    currentCollection?.isPublic && currentCollection.shareToken
      ? `${getSiteUrl()}/collections/share/${currentCollection.shareToken}`
      : undefined;

  return (
    <CollectionTopBar
      title={title}
      homeDecks={currentCollection?.homeDecks ?? []}
      onToggleSidebar={onToggleSidebar}
      mode={mode}
      valueCents={valueCents}
      unpricedCount={unpricedCount}
      formatValue={formatValue}
      addTarget={addTarget}
      addActionsInBar={!currentCollection || currentCollection.isInbox}
      showAddActions={!isEmpty}
      onQuickAdd={() => useCommandPaletteStore.getState().openQuickAdd("add")}
      onSelectAll={onSelectAll}
      onEnterSelect={onEnterSelect}
      onExitSelect={onExitSelect}
      hasCards={hasCards}
      isAllSelected={selectableRealCount > 0 && selectedCount === selectableRealCount}
      view={view}
      canEdit={Boolean(currentCollection) && canAdminCollection}
      canDelete={canDeleteCollection}
      canClearInbox={canClearInbox}
      canShare={Boolean(currentCollection) && canAdminCollection}
      canToggleDeckbuilding={Boolean(currentCollection)}
      deckbuildingAvailable={currentCollection?.availableForDeckbuilding ?? false}
      shareUrl={collectionShareUrl}
      collectionName={currentCollection?.name}
      onEdit={() => useCollectionOverlayStore.getState().setEditOpen(true)}
      onDelete={() => useCollectionOverlayStore.getState().setDeleteOpen(true)}
      onClearInbox={() => useCollectionOverlayStore.getState().setClearInboxOpen(true)}
      onShare={() => useCollectionOverlayStore.getState().setShareOpen(true)}
      onToggleDeckbuilding={() => {
        if (currentCollection) {
          setDeckbuilding.mutate({
            id: currentCollection.id,
            available: !currentCollection.availableForDeckbuilding,
          });
        }
      }}
    />
  );
}
