import type { Printing } from "@openrift/shared";
import { create } from "zustand";

import type { RuleExcludeTarget } from "@/lib/rule-exclude";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";

export interface CardRowClickModifiers {
  shift?: boolean;
  ctrl?: boolean;
}

/** "copyDetails" opens the per-copy metadata dialog; "lend" opens the lend-to-a-friend dialog. */
export type CollectionContextAction = "move" | "addToList" | "lend" | "dispose" | "copyDetails";

/** "takeOff" opens a kept-vs-sold/traded chooser. */
export type ListBulkAction = "move" | "remove" | "takeOff";

/** Exactly one surface is mounted at a time; a cleanup checks this to tell its own registration from a successor's. */
export type CardRowSurface = "catalog" | "collection" | "deck" | "list";

/** Handlers every card-browser surface can offer. */
interface BaseRowHandlers {
  /** `itemId` identifies the clicked row, for when one printing spans several rows. */
  onRowClick?: (printing: Printing, itemId?: string) => void;
  onSiblingClick?: (printing: Printing) => void;
  /** `quantity` is set only by the grid's digit-key shortcut; every other path means one. */
  onIncrement?: (printing: Printing, modifiers?: CardRowClickModifiers, quantity?: number) => void;
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
  /** Resolves mode-specific behavior: browse → open detail, select → toggle/shift-range. */
  onItemClick?: (itemId: string, printing: Printing, modifiers: CardRowClickModifiers) => void;
  /** Toggle the cell's stack in select mode (used by the cell's checkbox). */
  onItemToggle?: (itemId: string) => void;
  onAddToWishlist?: (printing: Printing) => void;
}

/** Handlers only /collections registers. */
interface CollectionRowHandlers {
  /**
   * The grid resolves the target (multi-selection, or just this card) before opening the dialog;
   * `printing` is the cell's *displayed* printing (sibling swaps included).
   */
  onContextAction?: (itemId: string, action: CollectionContextAction, printing?: Printing) => void;
  /** Claim `count` copies from the shared group collection; wired up only when group-owned. */
  onTake?: (itemId: string, count: number) => void;
}

/** Handlers only /lists registers. */
interface ListRowHandlers {
  /** Set an entry's quantity directly (browse-mode +/- buttons on the quantity strip). */
  onEntryQuantityChange?: (entryId: string, quantity: number) => void;
  /** Remove an entry directly (the minus button at quantity 1, no confirm). */
  onRemoveEntry?: (entryId: string, cardName: string) => void;
  /** Open the trade-preference editor for an entry. */
  onSetPreference?: (entryId: string) => void;
  /** Is the given entry currently waiting on a pending quantity mutation? */
  isQuantityPendingFor?: (entryId: string) => boolean;
  /** The browser resolves the target (multi-selection, or just this entry) before opening the dialog. */
  onListBulkAction?: (entryId: string, action: ListBulkAction) => void;
  /** Keyed by copy id, not entry id, so rule-produced entries (no `list_entries` row) can be moved too. */
  onMoveCopyToCollection?: (copyId: string) => void;
  /** Rule-produced entries have no `list_entries` row; this excludes them from the rule, not removes them. */
  onExcludeFromRule?: (target: RuleExcludeTarget) => void;
}

/** Keyed by surface, so a surface can't register another surface's vocabulary by accident. */
export interface HandlersBySurface {
  catalog: BaseRowHandlers;
  collection: BaseRowHandlers & CollectionRowHandlers;
  deck: BaseRowHandlers;
  list: BaseRowHandlers & ListRowHandlers;
}

type CardRowHandlers = BaseRowHandlers & CollectionRowHandlers & ListRowHandlers;

interface CardRowActionsState {
  /** Which surface's handlers are in the slot, or null when it's empty. */
  owner: CardRowSurface | null;
  handlers: CardRowHandlers;
  setHandlers: <TSurface extends CardRowSurface>(
    owner: TSurface,
    handlers: HandlersBySurface[TSurface],
  ) => void;
  /** No-ops when `owner` isn't the current slot holder, so a late-unmounting surface can't wipe a successor's registration. */
  clearHandlers: (owner: CardRowSurface) => void;
}

export const useCardRowActionsStore = create<CardRowActionsState>()((set) => ({
  owner: null,
  handlers: {},
  setHandlers: (owner, handlers) => set({ owner, handlers }),
  clearHandlers: (owner) =>
    set((state) => (state.owner === owner ? { owner: null, handlers: {} } : state)),
}));

// Module-scoped trampolines with permanent identity, so passing them to memoized
// children (e.g. CardThumbnail) never bails the memo on a fresh closure.
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

export function dispatchAddToWishlist(printing: Printing): void {
  useCardRowActionsStore.getState().handlers.onAddToWishlist?.(printing);
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

export function dispatchContextAction(
  itemId: string,
  action: CollectionContextAction,
  printing?: Printing,
): void {
  useCardRowActionsStore.getState().handlers.onContextAction?.(itemId, action, printing);
}

export function dispatchTake(itemId: string, count: number): void {
  useCardRowActionsStore.getState().handlers.onTake?.(itemId, count);
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

export function dispatchListBulkAction(entryId: string, action: ListBulkAction): void {
  useCardRowActionsStore.getState().handlers.onListBulkAction?.(entryId, action);
}

export function dispatchMoveCopyToCollection(copyId: string): void {
  useCardRowActionsStore.getState().handlers.onMoveCopyToCollection?.(copyId);
}

export function dispatchExcludeFromRule(target: RuleExcludeTarget): void {
  useCardRowActionsStore.getState().handlers.onExcludeFromRule?.(target);
}

export function isQuantityPending(entryId: string): boolean {
  return useCardRowActionsStore.getState().handlers.isQuantityPendingFor?.(entryId) ?? false;
}
