import type { Printing } from "@openrift/shared";
import { create } from "zustand";

import type { VariantPopoverIntent } from "@/stores/add-mode-store";

export interface CardRowClickModifiers {
  shift?: boolean;
  ctrl?: boolean;
}

/** Bulk actions offered by the /collections right-click menu (mirror the floating action bar). */
export type CollectionContextAction = "move" | "addToList" | "dispose";

interface CardRowHandlers {
  onRowClick?: (printing: Printing) => void;
  onSiblingClick?: (printing: Printing) => void;
  onIncrement?: (printing: Printing, modifiers?: CardRowClickModifiers) => void;
  onDecrement?: (
    printing: Printing,
    anchorEl?: HTMLElement,
    modifiers?: CardRowClickModifiers,
  ) => void;
  onOpenVariants?: (
    printing: Printing,
    anchorEl: HTMLElement,
    intent: VariantPopoverIntent,
  ) => void;
  /**
   * Cell-aware click: dispatched on the grid tile with modifier keys. The
   * handler resolves mode-specific behavior (browse → open detail, select →
   * toggle / shift-range, ctrl in browse → enter select mode + toggle).
   */
  onItemClick?: (itemId: string, printing: Printing, modifiers: CardRowClickModifiers) => void;
  /** Toggle the cell's stack in select mode (used by the cell's checkbox). */
  onItemToggle?: (itemId: string) => void;
  /**
   * /collections: a right-click menu action on a card. The grid resolves the
   * target — the current multi-selection when this card is part of it,
   * otherwise just this card — then opens the matching dialog.
   */
  onContextAction?: (itemId: string, action: CollectionContextAction) => void;
  /** /lists: set an entry's quantity directly (browse-mode +/- buttons on the quantity strip). */
  onEntryQuantityChange?: (entryId: string, quantity: number) => void;
  /** /lists: remove an entry (right-click context menu). */
  onRemoveEntry?: (entryId: string, cardName: string) => void;
  /** /lists: open the trade-preference editor for an entry. */
  onSetPreference?: (entryId: string) => void;
  /** /lists: is the given entry currently waiting on a pending quantity mutation? */
  isQuantityPendingFor?: (entryId: string) => boolean;
}

interface CardRowActionsState {
  handlers: CardRowHandlers;
  setHandlers: (handlers: CardRowHandlers) => void;
}

// Why a registry instead of prop drilling: card-browser's quick-add handlers
// close over TanStack mutation results that get a fresh object identity every
// render. Drilling them through the virtualized table/grid blew memo() on
// every row whenever the parent re-rendered (mutation pending flips, owned
// count map updates). Rows now read at click time via getState() — no React
// subscription, so registry updates don't trigger re-renders, and the row's
// prop surface stays stable across parent re-renders.
export const useCardRowActionsStore = create<CardRowActionsState>()((set) => ({
  handlers: {},
  setHandlers: (handlers) => set({ handlers }),
}));

// Module-scoped trampolines with permanent identity. Pass these as props to
// memoized children (e.g. CardThumbnail) where a fresh closure each render
// would bail the memo. Each call resolves the latest registered handler via
// getState(), so behavior tracks the active CardBrowser/CollectionGrid.
export function dispatchRowClick(printing: Printing): void {
  useCardRowActionsStore.getState().handlers.onRowClick?.(printing);
}

export function dispatchSiblingClick(printing: Printing): void {
  useCardRowActionsStore.getState().handlers.onSiblingClick?.(printing);
}

export function dispatchIncrement(printing: Printing, modifiers?: CardRowClickModifiers): void {
  useCardRowActionsStore.getState().handlers.onIncrement?.(printing, modifiers);
}

export function dispatchDecrement(
  printing: Printing,
  anchorEl: HTMLElement,
  modifiers?: CardRowClickModifiers,
): void {
  useCardRowActionsStore.getState().handlers.onDecrement?.(printing, anchorEl, modifiers);
}

export function dispatchOpenVariants(
  printing: Printing,
  anchorEl: HTMLElement,
  intent: VariantPopoverIntent,
): void {
  useCardRowActionsStore.getState().handlers.onOpenVariants?.(printing, anchorEl, intent);
}

export function dispatchItemClick(
  itemId: string,
  printing: Printing,
  modifiers: CardRowClickModifiers,
): void {
  useCardRowActionsStore.getState().handlers.onItemClick?.(itemId, printing, modifiers);
}

export function dispatchItemToggle(itemId: string): void {
  useCardRowActionsStore.getState().handlers.onItemToggle?.(itemId);
}

export function dispatchContextAction(itemId: string, action: CollectionContextAction): void {
  useCardRowActionsStore.getState().handlers.onContextAction?.(itemId, action);
}

export function dispatchEntryQuantityChange(entryId: string, quantity: number): void {
  useCardRowActionsStore.getState().handlers.onEntryQuantityChange?.(entryId, quantity);
}

export function dispatchRemoveEntry(entryId: string, cardName: string): void {
  useCardRowActionsStore.getState().handlers.onRemoveEntry?.(entryId, cardName);
}

export function dispatchSetPreference(entryId: string): void {
  useCardRowActionsStore.getState().handlers.onSetPreference?.(entryId);
}

export function isQuantityPending(entryId: string): boolean {
  return useCardRowActionsStore.getState().handlers.isQuantityPendingFor?.(entryId) ?? false;
}
