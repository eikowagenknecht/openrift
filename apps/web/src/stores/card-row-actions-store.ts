import type { Printing } from "@openrift/shared";
import { create } from "zustand";

import type { RuleExcludeTarget } from "@/lib/rule-exclude";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";

export interface CardRowClickModifiers {
  shift?: boolean;
  ctrl?: boolean;
}

/**
 * Actions offered by the /collections right-click menu. The bulk trio mirrors
 * the floating action bar; "copyDetails" opens the per-copy metadata dialog
 * (ADR-038) for the clicked tile's copies; "lend" opens the lend-to-a-friend
 * dialog (ADR-039) for the clicked tile's printing.
 */
export type CollectionContextAction = "move" | "addToList" | "lend" | "dispose" | "copyDetails";

/**
 * Bulk actions offered by the /lists right-click menu (mirror the floating
 * action bar). "remove" unlists card/printing-kind entries directly. "takeOff"
 * is the copy-kind (tradelist) path: it opens a chooser asking whether the copy
 * was kept (just unlist) or sold/traded (also dispose it from the collection),
 * so the two outcomes aren't two lookalike buttons.
 */
export type ListBulkAction = "move" | "remove" | "takeOff";

/**
 * The card-browser surfaces that register handlers here. Exactly one is mounted
 * at a time (each is its own route), and the tag makes that an assertion rather
 * than an assumption — it is what lets a surface's cleanup tell "I am the
 * registered owner, clear the slot" from "someone else already took over".
 */
export type CardRowSurface = "catalog" | "collection" | "deck" | "list";

/** Handlers every card-browser surface can offer. */
interface BaseRowHandlers {
  /**
   * Table row click. `itemId` identifies the clicked row, which matters where
   * one printing spans several rows (collections copies view).
   */
  onRowClick?: (printing: Printing, itemId?: string) => void;
  onSiblingClick?: (printing: Printing) => void;
  /**
   * Add one copy/entry of `printing`, or `quantity` of them when the caller
   * asks for more. Only the grid's digit-key shortcut passes a quantity; every
   * click path leaves it undefined and means one.
   */
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
  /**
   * Cell-aware click: dispatched on the grid tile with modifier keys. The
   * handler resolves mode-specific behavior (browse → open detail, select →
   * toggle / shift-range, ctrl in browse → enter select mode + toggle).
   */
  onItemClick?: (itemId: string, printing: Printing, modifiers: CardRowClickModifiers) => void;
  /** Toggle the cell's stack in select mode (used by the cell's checkbox). */
  onItemToggle?: (itemId: string) => void;
  /**
   * Open the wishlist picker for `printing`. A wish is a card- or
   * printing-kind entry, so the picker shapes it to the list the user lands
   * on rather than the surface deciding up front.
   */
  onAddToWishlist?: (printing: Printing) => void;
}

/** Handlers only /collections registers. */
interface CollectionRowHandlers {
  /**
   * A right-click menu action on a card. The grid resolves the target — the
   * current multi-selection when this card is part of it, otherwise just this
   * card — then opens the matching dialog. `printing` is the cell's *displayed*
   * printing (sibling swaps included), for actions that target one printing
   * rather than the whole tile ("lend", ADR-039).
   */
  onContextAction?: (itemId: string, action: CollectionContextAction, printing?: Printing) => void;
  /**
   * Group "bulk box": take `count` copies of this card from the shared group
   * collection into the viewer's inbox (a free-pile claim, capped to what the
   * box holds). Only wired up when the collection is group-owned.
   */
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
  /**
   * A right-click menu bulk action on an entry. The browser resolves the
   * target — the current multi-selection when this entry is part of it,
   * otherwise just this entry — then opens the matching dialog.
   */
  onListBulkAction?: (entryId: string, action: ListBulkAction) => void;
  /**
   * Copy-kind entries: move the physical copies behind them into another
   * collection. Keyed by copy id rather than entry id, so rule-produced
   * entries (ADR-034, no `list_entries` row) can be moved too — a copy exists
   * whether or not a rule is what put it on the list. The browser widens the
   * target to the current selection when this entry is part of it.
   */
  onMoveCopyToCollection?: (copyId: string) => void;
  /**
   * Drop a rule-produced entry from the list's dynamic rules (ADR-034). Rule
   * entries have no `list_entries` row, so they can't be removed — only
   * excluded, which appends the target id to the producing rule(s) and re-saves.
   */
  onExcludeFromRule?: (target: RuleExcludeTarget) => void;
}

/**
 * What a surface may register, keyed by surface. The dispatchers below read
 * through the union, so a handler stays reachable from any cell; the split is
 * what stops a surface registering another surface's vocabulary by accident.
 */
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
  /**
   * Empty the slot, but only if `owner` still holds it. An unconditional clear
   * would let a surface unmounting after its successor mounted wipe the
   * successor's registration.
   */
  clearHandlers: (owner: CardRowSurface) => void;
}

// Why a registry instead of prop drilling: card-browser's quick-add handlers
// close over TanStack mutation results that get a fresh object identity every
// render. Drilling them through the virtualized table/grid blew memo() on
// every row whenever the parent re-rendered (mutation pending flips, owned
// count map updates). Rows now read at click time via getState() — no React
// subscription, so registry updates don't trigger re-renders, and the row's
// prop surface stays stable across parent re-renders.
export const useCardRowActionsStore = create<CardRowActionsState>()((set) => ({
  owner: null,
  handlers: {},
  setHandlers: (owner, handlers) => set({ owner, handlers }),
  clearHandlers: (owner) =>
    set((state) => (state.owner === owner ? { owner: null, handlers: {} } : state)),
}));

// Module-scoped trampolines with permanent identity. Pass these as props to
// memoized children (e.g. CardThumbnail) where a fresh closure each render
// would bail the memo. Each call resolves the latest registered handler via
// getState(), so behavior tracks the active CardBrowser/CollectionGrid.
// Grid cells pass this straight to their click handler, which calls it with a
// mouse event as the second argument — hence the single declared parameter, so
// the event can never be mistaken for a row's `itemId`. The table, which does
// know its row id, calls the handler directly.
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
