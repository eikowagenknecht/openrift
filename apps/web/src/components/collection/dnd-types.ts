import type { ListIntent, ListKind, Printing } from "@openrift/shared";

/** Data attached to every draggable card in the collection grid. */
export interface CardDragData {
  type: "collection-card";
  copyIds: string[];
  /**
   * True when the drag started from a tile that's part of an active
   * multi-selection — the whole selection moves. Because `copyIds` is frozen at
   * render time and already-selected grid cells don't re-render as more cards
   * join the selection, the real copy IDs are resolved from the live selection
   * store at grab/drop time (see {@link resolveSelectionDrag}); the `copyIds`
   * baked in here is only a fallback. False for a lone stack/copy drag.
   */
  fromSelection: boolean;
  /**
   * True when the drag represents a multi-copy stack that should be trimmed to
   * one copy unless Shift is held at drop time. False for unit drags (single
   * copy, or an explicit select-mode selection the user built up by hand).
   */
  isStackDrag: boolean;
  printing: Printing;
  /** Up to 3 unique printings from the dragged cards, for the overlay preview. */
  previewPrintings: Printing[];
  sourceCollectionId: string | undefined;
  /**
   * True when every dragged copy lives in a shared *group* collection (none are
   * personally owned). Such copies aren't the user's to trade away or wish for,
   * so a trade/wish list refuses the drop — mirroring the server's personalOnly
   * rule. A mixed drag still lands its personal copies, so this stays false
   * unless the whole drag is group-owned. Always false for select-mode drags,
   * whose copy set is resolved live at drop time (see {@link resolveSelectionDrag}).
   */
  sourceAllGroupCopies: boolean;
}

/**
 * Data attached to a tile dragged from a list page. The route-level handler
 * routes this to {@link useMoveListEntries} when dropped on a sidebar list of
 * the matching `sourceKind` + `sourceIntent`. There is no stack-trim modifier
 * — moving a single tile carries the whole entry (with its full quantity).
 */
export interface ListEntryDragData {
  type: "list-entry";
  entryIds: string[];
  sourceListId: string;
  sourceKind: ListKind;
  sourceIntent: ListIntent;
  /** Total quantity across the dragged entries — for the overlay badge. */
  totalQuantity: number;
  /** Display printing for the front of the fan. */
  printing: Printing;
  cardName: string;
}

/**
 * Tagged on a sidebar row's `useSortable` so the layout-level `handleDragEnd`
 * knows to skip it — sidebar reorder is handled locally via `useDndMonitor`
 * inside `CollectionSidebar`, not by the route handler.
 */
export interface SidebarReorderCollectionDragData {
  type: "sidebar-reorder-collection";
  collectionId: string;
}

export interface SidebarReorderListDragData {
  type: "sidebar-reorder-list";
  listId: string;
  intent: ListIntent;
}

export type AnyDragData =
  | CardDragData
  | ListEntryDragData
  | SidebarReorderCollectionDragData
  | SidebarReorderListDragData;
