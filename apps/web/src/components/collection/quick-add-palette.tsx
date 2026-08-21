import type { CollectionResponse, Printing } from "@openrift/shared";
import { imageUrl, legendDisplayName } from "@openrift/shared";
import {
  ArrowRightIcon,
  ArrowRightLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PrintingRowContent } from "@/components/cards/printing-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePrices } from "@/hooks/use-prices";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useQuickAddMoveMode } from "@/hooks/use-quick-add-move-mode";
import { useQuickAddSearch } from "@/hooks/use-quick-add-search";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { MOVE_FROM_ANYWHERE } from "@/lib/move-sources";
import { cn } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";

import { AnnotatedDisposeDialog } from "./annotated-dispose-dialog";
import { QuickAddPreview } from "./quick-add-preview";
import { QuickAddStepper } from "./quick-add-stepper";

interface QuickAddPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionName: string;
  printingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
  /**
   * Allowlist of language codes the user wants to see in the palette. When
   * provided, printings outside this list are filtered out. Routes that
   * already seed `filters.languages` from the user pref (e.g. /cards) leave
   * this undefined; routes that don't (e.g. /collections) pass the user pref
   * so disabled languages don't surface here.
   */
  preferredLanguages?: readonly string[];
  /**
   * The viewer's collections — enables the Move mode (pull existing copies
   * into the target instead of adding new ones). Omit to keep the palette
   * add-only. Needs at least two collections to be useful.
   */
  collections?: CollectionResponse[];
}

export function QuickAddPalette({
  open,
  onOpenChange,
  collectionId,
  collectionName,
  printingsByCardId,
  ownedCountByPrinting,
  preferredLanguages,
  collections,
}: QuickAddPaletteProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerTitle className="sr-only">Quick add to {collectionName}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {open && (
              <PaletteInner
                collectionId={collectionId}
                collectionName={collectionName}
                printingsByCardId={printingsByCardId}
                ownedCountByPrinting={ownedCountByPrinting}
                preferredLanguages={preferredLanguages}
                collections={collections}
                isMobile
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 overflow-visible p-0 sm:max-w-md"
      >
        <DialogTitle className="sr-only">Quick add to {collectionName}</DialogTitle>
        {open && (
          <PaletteInner
            collectionId={collectionId}
            collectionName={collectionName}
            printingsByCardId={printingsByCardId}
            ownedCountByPrinting={ownedCountByPrinting}
            preferredLanguages={preferredLanguages}
            collections={collections}
            isMobile={false}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PaletteInnerProps {
  collectionId: string;
  collectionName: string;
  printingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
  preferredLanguages?: readonly string[];
  collections?: CollectionResponse[];
  isMobile: boolean;
}

function PaletteInner({
  collectionId,
  collectionName,
  printingsByCardId,
  ownedCountByPrinting,
  preferredLanguages,
  collections,
  isMobile,
}: PaletteInnerProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollOnChange = useRef(false);
  const addedItems = useAddModeStore((s) => s.addedItems);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const prices = usePrices();
  const favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader";
  const compactFmt = compactFormatterForMarketplace(favoriteMarketplace);

  // Add and undo run through the shared quick-add hook, so the palette gets the
  // same ADR-038 handling the collection grid has: undoing an add whose copy has
  // since been annotated parks for confirmation instead of destroying the
  // details. The removal toast and the refocus fire from onDisposed, which runs
  // only once a removal actually lands — a parked one announces nothing and
  // leaves focus to the confirmation dialog.
  const {
    handleQuickAdd,
    tryUndoAdd,
    pendingAnnotatedDispose,
    confirmAnnotatedDispose,
    cancelAnnotatedDispose,
    disposeIsPending,
  } = useQuickAddActions(collectionId, collectionId, (printing) => {
    toast.success(`Removed 1× ${legendDisplayName(printing.card)}`);
    inputRef.current?.focus();
  });

  const move = useQuickAddMoveMode({
    collectionId,
    collections,
    selectionKey: `${expandedCardId ?? ""}:${expandedIndex}`,
    onMoved: () => inputRef.current?.focus(),
  });
  const { inMoveMode, moveFrom, moveTo } = move;

  const results = useQuickAddSearch(query, printingsByCardId, {
    // In move mode the ×N badges show what's movable in the current
    // From scope, not the global owned count.
    ownedCountByPrinting: inMoveMode ? (move.movableCounts ?? {}) : ownedCountByPrinting,
    preferredLanguages,
  });

  // Derive the printing to preview (only when a printing list is expanded)
  const previewPrinting = expandedCardId
    ? (results.find((r) => r.cardId === expandedCardId)?.printings[expandedIndex] ?? null)
    : null;
  // A failed preview image hides the preview panel entirely — the same
  // behavior as a printing with no image. Keyed by image id so expanding
  // another printing retries fresh.
  const [failedImageId, setFailedImageId] = useState<string | null>(null);
  const rawPreviewImageId = previewPrinting?.images[0]?.imageId ?? null;
  const previewImageId = rawPreviewImageId === failedImageId ? null : rawPreviewImageId;
  const markPreviewFailed = () => setFailedImageId(rawPreviewImageId);

  // Clamp selection when results change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, results.length - 1)));
    setExpandedCardId(null);
  }, [results.length]);

  // Scroll selected item into view (keyboard navigation only)
  useEffect(() => {
    if (!scrollOnChange.current) {
      return;
    }
    scrollOnChange.current = false;
    const list = listRef.current;
    if (!list) {
      return;
    }
    // When a card is expanded, both the card row and the active printing row
    // carry data-selected=true. Pick the last match so we scroll to the
    // printing (deeper in the DOM) rather than the already-visible card row.
    const candidates = list.querySelectorAll("[data-selected=true]");
    const target = candidates.item(candidates.length - 1);
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, expandedCardId, expandedIndex]);

  const handleAdd = async (printing: Printing) => {
    // The success toast is fired once per API batch by the shared hook, so a
    // held-Enter burst produces one aggregated line rather than N. Error toasts
    // come from the global mutation handler in query-client.ts.
    await handleQuickAdd?.(printing);
    inputRef.current?.focus();
  };

  const handleUndo = async (printing: Printing) => {
    // Session-only: the palette's minus takes back what this session added and
    // never touches a copy the user already owned. tryUndoAdd's owned-copy
    // fallback is for the collection grid's tile minus, where that count is the
    // thing being edited; here it is context for what you are adding to.
    const entry = useAddModeStore.getState().addedItems.get(printing.id);
    if (!entry || entry.copyIds.length === 0) {
      return;
    }
    await tryUndoAdd?.(printing);
  };

  const clearSearch = () => {
    setQuery("");
    setSelectedIndex(0);
    setExpandedCardId(null);
    inputRef.current?.focus();
  };

  // Applied as onMouseDown to every clickable element in the result list.
  // Preventing mousedown's default keeps focus in the search input, so
  // keyboard navigation survives any mouse click (clicks still fire).
  const keepInputFocus = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  // Determine if the currently selected printing (when expanded) has session adds, for footer hint
  const expandedCard = expandedCardId
    ? results.find((r) => r.cardId === expandedCardId)
    : undefined;
  const selectedPrinting = expandedCard?.printings[expandedIndex];
  const selectedSourceCount =
    inMoveMode && moveFrom === MOVE_FROM_ANYWHERE && selectedPrinting
      ? move.sourcesFor(selectedPrinting.id).length
      : 0;
  const canUndoSelected = selectedPrinting
    ? inMoveMode
      ? move.movedCount(selectedPrinting.id) > 0
      : (addedItems.get(selectedPrinting.id)?.quantity ?? 0) > 0
    : false;

  // Handled on the palette root, not the input: after clicking a tab (or any
  // other control) focus leaves the input, and the shortcut should keep
  // working from anywhere inside the palette. React synthetic events bubble
  // here even from portaled popups.
  const handleModeShortcut = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m" && move.canMove) {
      event.preventDefault();
      move.toggleMode();
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      scrollOnChange.current = true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (expandedCardId) {
        const card = results.find((r) => r.cardId === expandedCardId);
        if (card) {
          setExpandedIndex((prev) => Math.min(prev + 1, card.printings.length - 1));
        }
      } else {
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (expandedCardId) {
        setExpandedIndex((prev) => Math.max(prev - 1, 0));
      } else {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
    } else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
      if (expandedCardId) {
        event.preventDefault();
        // Step back through the source chips first; only from the leftmost
        // chip does Left collapse the card (go back one level).
        if (inMoveMode && moveFrom === MOVE_FROM_ANYWHERE && selectedPrinting) {
          const sources = move.sourcesFor(selectedPrinting.id);
          const activeSource = Math.min(move.sourceIndex, sources.length - 1);
          if (activeSource > 0) {
            move.setSourceIndex(activeSource - 1);
            return;
          }
        }
        setExpandedCardId(null);
      }
    } else if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) {
      if (expandedCardId) {
        // Inside an expanded card, walk rightward through the source chips
        // (move mode with an open source scope only). Clamps at the last
        // chip — Left walks back and exits at the leftmost, so no wrap.
        if (inMoveMode && moveFrom === MOVE_FROM_ANYWHERE && selectedPrinting) {
          const sources = move.sourcesFor(selectedPrinting.id);
          if (sources.length > 1) {
            event.preventDefault();
            move.setSourceIndex(
              Math.min(Math.min(move.sourceIndex, sources.length - 1) + 1, sources.length - 1),
            );
          }
        }
      } else {
        const card = results[selectedIndex];
        if (card) {
          event.preventDefault();
          setExpandedCardId(card.cardId);
          setExpandedIndex(0);
        }
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results.length === 0) {
        return;
      }
      if (expandedCardId) {
        const card = results.find((r) => r.cardId === expandedCardId);
        if (card) {
          const printing = card.printings[expandedIndex];
          if (event.shiftKey) {
            void (inMoveMode ? move.undoMove(printing) : handleUndo(printing));
          } else {
            void (inMoveMode ? move.moveOne(printing) : handleAdd(printing));
          }
        }
      } else {
        const card = results[selectedIndex];
        if (card) {
          setExpandedCardId(card.cardId);
          setExpandedIndex(0);
        }
      }
    } else if (event.key === "Escape") {
      if (expandedCardId) {
        event.preventDefault();
        event.stopPropagation();
        setExpandedCardId(null);
      } else if (query.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        clearSearch();
      }
      // When nothing to clear, let the dialog/drawer handle Escape
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- bubbling keyboard shortcut listener, not an interactive element
    <div className="relative" onKeyDown={handleModeShortcut}>
      {/* Card image preview — at the top of the drawer on mobile, where there's
          no off-canvas space for the desktop side pane. It renders at a fixed
          160px, so a lighter variant is plenty (400w covers it at DPR 2). */}
      {previewPrinting && previewImageId && isMobile && (
        <div className="mb-3 flex justify-center">
          <QuickAddPreview
            printing={previewPrinting}
            src={imageUrl(previewImageId, "400w")}
            className="w-40"
            onError={markPreviewFailed}
          />
        </div>
      )}

      {/* Card image preview — floats left of the dialog on desktop */}
      {previewPrinting && previewImageId && (
        <div className="absolute top-0 right-full mr-3 hidden w-96 lg:block">
          <QuickAddPreview
            printing={previewPrinting}
            src={imageUrl(previewImageId, "full")}
            onError={markPreviewFailed}
          />
        </div>
      )}

      {/* Mode toggle + move direction. The drawer already pads its content
          (p-4), so the horizontal inset applies on desktop only. */}
      {move.canMove && (
        <div className={cn("flex flex-col gap-2 pb-1", !isMobile && "px-3 pt-3")}>
          <Tabs
            value={move.mode}
            onValueChange={(value) => {
              move.setMode(value as "add" | "move");
              // Hand focus back to the search input so typing (and Ctrl+M)
              // keep working after a mouse click on a tab.
              inputRef.current?.focus();
            }}
          >
            <TabsList className="w-full">
              {/* The shortcut hint sits on the inactive tab — the one Ctrl+M
                  would switch to. Keyboard-only, so hidden on mobile. */}
              <TabsTrigger value="add">
                Add
                {!isMobile && move.mode === "move" && (
                  <Kbd className="pointer-events-none opacity-60">Ctrl+M</Kbd>
                )}
              </TabsTrigger>
              <TabsTrigger value="move">
                Move
                {!isMobile && move.mode === "add" && (
                  <Kbd className="pointer-events-none opacity-60">Ctrl+M</Kbd>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {inMoveMode && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">from</span>
              <Select
                items={move.fromItems}
                value={moveFrom}
                onValueChange={(value) => {
                  if (value) {
                    move.chooseMoveFrom(value);
                  }
                }}
              >
                <SelectTrigger aria-label="Move from" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {move.fromItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={move.handleSwapDirection}
                aria-label="Swap move direction"
              >
                <ArrowRightLeftIcon />
              </Button>
              <span className="text-muted-foreground text-xs">to</span>
              <Select
                items={move.toItems}
                value={moveTo}
                onValueChange={(value) => {
                  if (value) {
                    move.chooseMoveTo(value);
                  }
                }}
              >
                <SelectTrigger aria-label="Move to" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {move.toItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* SearchIcon input */}
      <InputGroup className="h-11 border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
        <InputGroupAddon align="inline-start">
          <SearchIcon className="text-muted-foreground size-4" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="text"
          aria-label={
            inMoveMode
              ? `Move card to ${move.collectionDisplayName(moveTo)}`
              : `Add card to ${collectionName}`
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            inMoveMode
              ? `Move to "${move.collectionDisplayName(moveTo)}"...`
              : `Add to "${collectionName}"...`
          }
          className="text-base sm:text-sm"
          autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- command palette, always focused on open
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" onClick={clearSearch} aria-label="Clear search">
              <XIcon className="size-4" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="border-border border-t" />

      {/* Results — taller while a card is expanded on desktop, so the
          printing rows (plus source chips in move mode) fit without
          scrolling. The drawer keeps one height; vertical space there is
          the screen itself. */}
      <div
        ref={listRef}
        className={cn("overflow-y-auto", !isMobile && expandedCardId ? "max-h-112" : "max-h-72")}
      >
        {/* Empty state */}
        {query.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            {inMoveMode ? "Type a card name to move" : "Type a card name to add"}
          </div>
        )}

        {/* No results */}
        {query.length > 0 && results.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            No cards matching &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Result list */}
        {results.map((card, index) => {
          const isSelected = index === selectedIndex && !expandedCardId;
          const isExpanded = expandedCardId === card.cardId;
          const shortCodes = card.printings.map((p) => p.shortCode);
          return (
            <div key={card.cardId}>
              {/* Card row — always expands to show printings */}
              <Pressable
                data-selected={isSelected || isExpanded}
                className={cn(
                  "group flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors",
                  isSelected || isExpanded ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
                onMouseDown={keepInputFocus}
                onClick={() => {
                  setSelectedIndex(index);
                  setExpandedCardId(isExpanded ? null : card.cardId);
                  setExpandedIndex(0);
                }}
                onMouseEnter={() => {
                  if (!expandedCardId) {
                    setSelectedIndex(index);
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{card.cardName}</div>
                  <div className="text-muted-foreground group-data-[selected=true]:text-accent-foreground/80 text-xs">
                    {shortCodes.join(" · ")}
                  </div>
                </div>
                {card.ownedCount > 0 && (
                  <span className="text-muted-foreground group-data-[selected=true]:text-accent-foreground/80 shrink-0 text-xs tabular-nums">
                    ×{card.ownedCount}
                  </span>
                )}
                <ChevronRightIcon
                  className={cn(
                    "text-muted-foreground group-data-[selected=true]:text-accent-foreground size-4 shrink-0 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              </Pressable>

              {/* Expanded printing list */}
              {isExpanded && (
                <div className="bg-muted/50 px-1 py-1">
                  {card.printings.map((printing, printingIndex) => {
                    const isPrintingSelected = printingIndex === expandedIndex;
                    // ownedForPrinting comes from useOwnedCount → useLiveQuery
                    // on copiesCollection. useBatchedAddCopies optimistically
                    // inserts a temp row at click time, so this count already
                    // includes pending adds. Don't add sessionAdded on top.
                    const ownedForPrinting = ownedCountByPrinting?.[printing.id] ?? 0;
                    const addedEntry = addedItems.get(printing.id);
                    const sessionAdded =
                      (addedEntry?.quantity ?? 0) + (addedEntry?.pendingCount ?? 0);
                    const movableForPrinting = move.movableCounts?.[printing.id] ?? 0;
                    const movedThisSession = move.movedCount(printing.id);
                    // Source breakdown only for the selected row — it drives
                    // both the per-source chips (From = anywhere) and the
                    // "nothing to move" note.
                    const sources =
                      inMoveMode && isPrintingSelected ? move.sourcesFor(printing.id) : null;
                    const price = prices.get(printing.id, favoriteMarketplace);
                    const cardName = legendDisplayName(printing.card);
                    return (
                      <div
                        key={printing.id}
                        data-selected={isPrintingSelected}
                        className={cn(
                          "group rounded transition-colors",
                          isPrintingSelected && "bg-accent text-accent-foreground",
                        )}
                        onMouseEnter={() => setExpandedIndex(printingIndex)}
                      >
                        <div className="flex w-full items-center gap-1 text-xs">
                          {/* The shared row mutes its short code, which is
                              unreadable on the selected row's accent fill, so
                              the selected state recolors it from out here
                              rather than teaching the shared row about
                              selection. */}
                          <div className="group-data-[selected=true]:[&_.text-muted-foreground]:text-accent-foreground/80 flex min-w-0 flex-1 items-center px-2 py-1.5">
                            <PrintingRowContent printing={printing} siblings={card.printings} />
                          </div>
                          {price !== undefined && (
                            <span
                              className={cn(
                                "text-2xs shrink-0 tabular-nums",
                                isPrintingSelected
                                  ? "text-accent-foreground/80"
                                  : priceColorClass(price),
                              )}
                            >
                              {compactFmt(price)}
                            </span>
                          )}
                          {inMoveMode ? (
                            <QuickAddStepper
                              count={movableForPrinting}
                              changed={movedThisSession > 0}
                              incrementIcon={<ArrowRightIcon />}
                              incrementLabel={`Move ${cardName}`}
                              decrementLabel={`Undo move ${cardName}`}
                              onIncrement={() => void move.moveOne(printing)}
                              onDecrement={() => void move.undoMove(printing)}
                              incrementDisabled={movableForPrinting === 0}
                              decrementDisabled={movedThisSession === 0}
                              onMouseDown={keepInputFocus}
                            />
                          ) : (
                            <QuickAddStepper
                              count={ownedForPrinting}
                              changed={sessionAdded > 0}
                              incrementIcon={<PlusIcon />}
                              incrementLabel={`Add ${cardName}`}
                              decrementLabel={`Undo add ${cardName}`}
                              onIncrement={() => void handleAdd(printing)}
                              onDecrement={() => void handleUndo(printing)}
                              decrementDisabled={sessionAdded === 0}
                              onMouseDown={keepInputFocus}
                            />
                          )}
                        </div>
                        {/* Per-source breakdown for the selected row in move mode */}
                        {sources !== null &&
                          (sources.length === 0 ? (
                            <div className="text-2xs text-accent-foreground/80 px-2 pb-1.5">
                              No copies available to move
                            </div>
                          ) : (
                            moveFrom === MOVE_FROM_ANYWHERE && (
                              <div className="text-2xs flex flex-wrap items-center gap-1 px-2 pb-1.5">
                                <span className="text-accent-foreground/80">from</span>
                                {sources.map((source, chipIndex) => {
                                  const isActiveSource =
                                    chipIndex === Math.min(move.sourceIndex, sources.length - 1);
                                  return (
                                    <Pressable
                                      key={source.collectionId}
                                      onMouseDown={keepInputFocus}
                                      className={cn(
                                        "rounded-full border px-2 py-0.5 tabular-nums",
                                        isActiveSource
                                          ? "bg-accent-foreground text-accent border-transparent"
                                          : "border-accent-foreground/30 hover:bg-accent-foreground/10",
                                      )}
                                      onClick={() => {
                                        move.setSourceIndex(chipIndex);
                                        void move.moveOne(printing, source.collectionId);
                                      }}
                                    >
                                      {move.collectionDisplayName(source.collectionId)} ×
                                      {source.copyIds.length}
                                      {isActiveSource && !isMobile && (
                                        <span className="opacity-70"> ↵</span>
                                      )}
                                    </Pressable>
                                  );
                                })}
                              </div>
                            )
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hints — keyboard only, hidden on mobile */}
      {!isMobile && results.length > 0 && (
        <>
          <div className="border-border border-t" />
          <div className="text-muted-foreground flex items-center gap-3 px-3 py-2 text-xs">
            <span>
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> {expandedCardId ? (inMoveMode ? "move" : "add") : "select"}
            </span>
            {expandedCardId && canUndoSelected && (
              <span>
                <Kbd>⇧↵</Kbd> undo
              </span>
            )}
            {expandedCardId && (
              <span>
                <Kbd>←</Kbd> back
              </span>
            )}
            {expandedCardId && selectedSourceCount > 1 && (
              <span>
                <Kbd>→</Kbd> source
              </span>
            )}
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </>
      )}

      {/* Mounted inside the palette so both call sites get it — /cards has no
          other AnnotatedDisposeDialog, and on /collections the grid's copy is
          driven by its own separate quick-add state. */}
      <AnnotatedDisposeDialog
        pending={pendingAnnotatedDispose}
        onConfirm={() => void confirmAnnotatedDispose()}
        onCancel={cancelAnnotatedDispose}
        isPending={disposeIsPending}
      />
    </div>
  );
}
