import type { Printing } from "@openrift/shared";
import { create } from "zustand";

import type { VariantPopoverIntent } from "@/stores/add-mode-store";

export interface CardRowClickModifiers {
  shift?: boolean;
}

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
