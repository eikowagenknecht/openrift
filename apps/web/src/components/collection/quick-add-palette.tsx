import type { CollectionResponse, Printing } from "@openrift/shared";
import { imageUrl, legendDisplayName } from "@openrift/shared";
import {
  ArrowRightIcon,
  ArrowRightLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PrintingRowContent } from "@/components/cards/printing-row";
import { PaletteFrame } from "@/components/command-palette/palette-frame";
import { PaletteScopeToken } from "@/components/command-palette/palette-scope-token";
import { Button } from "@/components/ui/button";
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
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePrices } from "@/hooks/use-prices";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useQuickAddMoveMode } from "@/hooks/use-quick-add-move-mode";
import { useQuickAddSearch } from "@/hooks/use-quick-add-search";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { MOVE_FROM_ANYWHERE } from "@/lib/move-sources";
import { cn } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";
import type { QuickAddVerb } from "@/stores/command-palette-store";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
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
  /** Allowlist of language codes to show; when provided, other printings are filtered out. */
  preferredLanguages?: readonly string[];
  /** Enables Move mode (pull existing copies into the target). Omit to keep the palette add-only. */
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
  const verb = useCommandPaletteStore((state) => state.quickAddVerb);
  const scopeLabel = verb === "move" ? "Move" : `Add to ${collectionName}`;

  return (
    <PaletteFrame
      open={open}
      onOpenChange={onOpenChange}
      title={`Quick ${verb} to ${collectionName}`}
    >
      <PaletteInner
        verb={verb}
        scopeLabel={scopeLabel}
        collectionId={collectionId}
        collectionName={collectionName}
        printingsByCardId={printingsByCardId}
        ownedCountByPrinting={ownedCountByPrinting}
        preferredLanguages={preferredLanguages}
        collections={collections}
        isMobile={isMobile}
      />
    </PaletteFrame>
  );
}

interface PaletteInnerProps {
  verb: QuickAddVerb;
  scopeLabel: string;
  collectionId: string;
  collectionName: string;
  printingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
  preferredLanguages?: readonly string[];
  collections?: CollectionResponse[];
  isMobile: boolean;
}

function PaletteInner({
  verb,
  scopeLabel,
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

  // Toast/refocus fire from onDisposed, which only runs once a removal lands.
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
    verb,
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

  const previewPrinting = expandedCardId
    ? (results.find((r) => r.cardId === expandedCardId)?.printings[expandedIndex] ?? null)
    : null;
  // Keyed by image id, not a boolean, so expanding another printing retries fresh.
  const [failedImageId, setFailedImageId] = useState<string | null>(null);
  const rawPreviewImageId = previewPrinting?.images[0]?.imageId ?? null;
  const previewImageId = rawPreviewImageId === failedImageId ? null : rawPreviewImageId;
  const markPreviewFailed = () => setFailedImageId(rawPreviewImageId);

  const [clampedFor, setClampedFor] = useState(results.length);
  if (clampedFor !== results.length) {
    setClampedFor(results.length);
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, results.length - 1)));
    setExpandedCardId(null);
  }

  useScopeEffect(`${selectedIndex} ${expandedCardId ?? ""} ${expandedIndex}`, () => {
    if (!scrollOnChange.current) {
      return;
    }
    scrollOnChange.current = false;
    const list = listRef.current;
    if (!list) {
      return;
    }
    // Both the card row and the active printing row carry data-selected=true
    // when expanded; the last match is the printing, deeper in the DOM.
    const candidates = list.querySelectorAll("[data-selected=true]");
    const target = candidates.item(candidates.length - 1);
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  });

  const handleAdd = async (printing: Printing) => {
    await handleQuickAdd?.(printing);
    inputRef.current?.focus();
  };

  const handleUndo = async (printing: Printing) => {
    // Session-only: takes back what this session added, never a copy the user already owned.
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

  // Preventing mousedown's default keeps focus in the search input so
  // keyboard navigation survives a mouse click on the result list.
  const keepInputFocus = (event: React.MouseEvent) => {
    event.preventDefault();
  };

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
        // Step back through source chips first; Left only collapses the card
        // once at the leftmost chip.
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
        // Clamps at the last source chip; no wrap.
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
    } else if (event.key === "Backspace" && query.length === 0 && !expandedCardId) {
      event.preventDefault();
      useCommandPaletteStore.getState().exitQuickAddScope();
    }
  };

  return (
    <div className="relative">
      {/* Renders at a fixed 160px; 400w covers it at DPR 2. */}
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

      {previewPrinting && previewImageId && (
        <div className="absolute top-0 right-full mr-3 hidden w-96 lg:block">
          <QuickAddPreview
            printing={previewPrinting}
            src={imageUrl(previewImageId, "full")}
            onError={markPreviewFailed}
          />
        </div>
      )}

      <InputGroup className="h-11 border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
        <InputGroupAddon align="inline-start">
          <PaletteScopeToken label={scopeLabel} />
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
          placeholder="Search cards..."
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

      {/* px-3 is desktop-only; the drawer already pads its content (p-4). */}
      {inMoveMode && (
        <div className={cn("flex items-center gap-1.5 pt-1 pb-2", !isMobile && "px-3")}>
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

      <div className="border-border border-t" />

      <div
        ref={listRef}
        className={cn("overflow-y-auto", !isMobile && expandedCardId ? "max-h-112" : "max-h-72")}
      >
        {query.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            {inMoveMode ? "Type a card name to move" : "Type a card name to add"}
          </div>
        )}

        {query.length > 0 && results.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            No cards matching &ldquo;{query}&rdquo;
          </div>
        )}

        {results.map((card, index) => {
          const isSelected = index === selectedIndex && !expandedCardId;
          const isExpanded = expandedCardId === card.cardId;
          const shortCodes = [...new Set(card.printings.map((p) => p.shortCode))];
          return (
            <div key={card.cardId}>
              <Pressable
                data-selected={isSelected || isExpanded}
                className={cn(
                  "group flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors",
                  isSelected || isExpanded ? "bg-muted text-foreground" : "hover:bg-muted",
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
                  <div className="text-muted-foreground group-data-[selected=true]:text-foreground/80 text-xs">
                    {shortCodes.join(" · ")}
                  </div>
                </div>
                {card.ownedCount > 0 && (
                  <span className="text-muted-foreground group-data-[selected=true]:text-foreground/80 shrink-0 text-xs tabular-nums">
                    ×{card.ownedCount}
                  </span>
                )}
                <ChevronRightIcon
                  className={cn(
                    "text-muted-foreground group-data-[selected=true]:text-foreground size-4 shrink-0 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              </Pressable>

              {isExpanded && (
                <div className="bg-muted/50 px-1 py-1">
                  {card.printings.map((printing, printingIndex) => {
                    const isPrintingSelected = printingIndex === expandedIndex;
                    // Optimistic adds are already reflected here (temp copy row); don't add sessionAdded on top.
                    const ownedForPrinting = ownedCountByPrinting?.[printing.id] ?? 0;
                    const addedEntry = addedItems.get(printing.id);
                    const sessionAdded =
                      (addedEntry?.quantity ?? 0) + (addedEntry?.pendingCount ?? 0);
                    const movableForPrinting = move.movableCounts?.[printing.id] ?? 0;
                    const movedThisSession = move.movedCount(printing.id);
                    const sources =
                      inMoveMode && isPrintingSelected ? move.sourcesFor(printing.id) : null;
                    const price = prices.get(printing.id, favoriteMarketplace);
                    const cardName = legendDisplayName(printing.card);
                    return (
                      <div
                        key={printing.id}
                        data-selected={isPrintingSelected}
                        className={cn(
                          "group rounded-md transition-colors",
                          isPrintingSelected && "bg-muted text-foreground",
                        )}
                        onMouseEnter={() => setExpandedIndex(printingIndex)}
                      >
                        <div className="flex w-full items-center gap-1 text-xs">
                          <div className="group-data-[selected=true]:[&_.text-muted-foreground]:text-foreground/80 flex min-w-0 flex-1 items-center px-2 py-1.5">
                            <PrintingRowContent printing={printing} siblings={card.printings} />
                          </div>
                          {price !== undefined && (
                            <span
                              className={cn(
                                "text-2xs shrink-0 tabular-nums",
                                isPrintingSelected ? "text-foreground/80" : priceColorClass(price),
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
                        {sources !== null &&
                          (sources.length === 0 ? (
                            <div className="text-2xs text-foreground/80 px-2 pb-1.5">
                              No copies available to move
                            </div>
                          ) : (
                            moveFrom === MOVE_FROM_ANYWHERE && (
                              <div className="text-2xs flex flex-wrap items-center gap-1 px-2 pb-1.5">
                                <span className="text-foreground/80">from</span>
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
                                          ? "bg-foreground text-background border-transparent"
                                          : "border-foreground/30 hover:bg-foreground/10",
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

      {/* Shown with an empty result list too: that's when the Backspace hint matters most. */}
      {!isMobile && (
        <>
          <div className="border-border border-t" />
          <div className="text-muted-foreground flex items-center gap-3 px-3 py-2 text-xs">
            {results.length > 0 && (
              <>
                <span>
                  <Kbd>↑↓</Kbd> navigate
                </span>
                <span>
                  <Kbd>↵</Kbd> {expandedCardId ? (inMoveMode ? "move" : "add") : "select"}
                </span>
              </>
            )}
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
            {query.length === 0 && !expandedCardId && (
              <span>
                <Kbd>⌫</Kbd> search everything
              </span>
            )}
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </>
      )}

      <AnnotatedDisposeDialog
        pending={pendingAnnotatedDispose}
        onConfirm={() => void confirmAnnotatedDispose()}
        onCancel={cancelAnnotatedDispose}
        isPending={disposeIsPending}
      />
    </div>
  );
}
