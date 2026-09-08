import type { Printing } from "@openrift/shared/types/catalog";

import { PrintingCountActions } from "@/features/cards/components/printing-count-actions";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { useFilterActions } from "@/features/cards/hooks/use-card-filters";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import { useSelectionStore } from "@/stores/selection-store";

interface CollectionDetailProps {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  showImages: boolean;
  collectionId: string | undefined;
  mode: "browse" | "select";
}

function useDetailWiring(collectionId: string | undefined, mode: "browse" | "select") {
  const isMobile = useIsMobile();
  const { setSearch } = useFilterActions();

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const actions =
    mode === "browse"
      ? (printing: Printing) => (
          <PrintingCountActions printing={printing} collectionId={collectionId} />
        )
      : undefined;

  return { isMobile, searchAndClose, actions };
}

/** The docked pane beside the grid; the phone gets the overlays instead. */
export function CollectionDetailPane({
  items,
  printingsByCardId,
  showImages,
  collectionId,
  mode,
}: CollectionDetailProps) {
  const { isMobile, searchAndClose, actions } = useDetailWiring(collectionId, mode);

  if (isMobile) {
    return null;
  }

  return (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
      actions={actions}
    />
  );
}

export function CollectionDetailOverlays({
  items,
  printingsByCardId,
  showImages,
  collectionId,
  mode,
}: CollectionDetailProps) {
  const { searchAndClose, actions } = useDetailWiring(collectionId, mode);

  return (
    <SelectionDetailOverlays
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
      actions={actions}
    />
  );
}
