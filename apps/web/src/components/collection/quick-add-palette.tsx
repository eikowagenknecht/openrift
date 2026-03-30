import type { Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { searchCards } from "@/hooks/use-quick-add-search";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, getCardImageUrl, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";

interface QuickAddPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionName: string;
  printingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
}

export function QuickAddPalette({
  open,
  onOpenChange,
  collectionId,
  collectionName,
  printingsByCardId,
  ownedCountByPrinting,
}: QuickAddPaletteProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerTitle className="sr-only">Quick add to {collectionName}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <PaletteInner
              collectionId={collectionId}
              collectionName={collectionName}
              printingsByCardId={printingsByCardId}
              ownedCountByPrinting={ownedCountByPrinting}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] max-w-md -translate-y-0 gap-0 overflow-visible p-0 sm:max-w-md"
      >
        <DialogTitle className="sr-only">Quick add to {collectionName}</DialogTitle>
        <PaletteInner
          collectionId={collectionId}
          collectionName={collectionName}
          printingsByCardId={printingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
        />
      </DialogContent>
    </Dialog>
  );
}

interface PaletteInnerProps {
  collectionId: string;
  collectionName: string;
  printingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
}

function PaletteInner({
  collectionId,
  collectionName,
  printingsByCardId,
  ownedCountByPrinting,
}: PaletteInnerProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollOnChange = useRef(false);
  const addCopies = useAddCopies();
  const disposeCopies = useDisposeCopies();
  const addedItems = useAddModeStore((s) => s.addedItems);

  const results = searchCards(query, printingsByCardId, ownedCountByPrinting);

  // Derive the printing to preview (only when a printing list is expanded)
  const previewPrinting = expandedCardId
    ? (results.find((r) => r.cardId === expandedCardId)?.printings[expandedIndex] ?? null)
    : null;
  const previewImageUrl = previewPrinting?.images[0]?.url ?? null;
  const previewRotated = previewPrinting
    ? needsCssRotation(getOrientation(previewPrinting.card.type))
    : false;

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
    const selected = list.querySelector("[data-selected=true]");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, expandedCardId, expandedIndex]);

  const handleAdd = (printing: Printing) => {
    addCopies.mutate(
      {
        copies: [{ printingId: printing.id, collectionId }],
      },
      {
        onSuccess: (data) => {
          const copyId = (data as { id: string }[])[0].id;
          useAddModeStore.getState().recordAdd(printing, copyId);
          toast.success(`Added 1× ${printing.card.name}`);
          inputRef.current?.focus();
        },
        onError: () => {
          toast.error(`Failed to add ${printing.card.name}`);
        },
      },
    );
  };

  const handleUndo = (printing: Printing) => {
    const entry = useAddModeStore.getState().addedItems.get(printing.id);
    if (!entry || entry.copyIds.length === 0) {
      return;
    }
    const copyIdToRemove = entry.copyIds.at(-1);
    if (!copyIdToRemove) {
      return;
    }
    disposeCopies.mutate(
      { copyIds: [copyIdToRemove] },
      {
        onSuccess: () => {
          useAddModeStore.getState().recordUndo(printing.id);
          toast.success(`Removed 1× ${printing.card.name}`);
          inputRef.current?.focus();
        },
        onError: () => {
          toast.error(`Failed to remove ${printing.card.name}`);
        },
      },
    );
  };

  const clearSearch = () => {
    setQuery("");
    setSelectedIndex(0);
    setExpandedCardId(null);
    inputRef.current?.focus();
  };

  // Determine if the currently selected printing (when expanded) has session adds, for footer hint
  const expandedCard = expandedCardId
    ? results.find((r) => r.cardId === expandedCardId)
    : undefined;
  const selectedPrinting = expandedCard?.printings[expandedIndex];
  const canUndoSelected = selectedPrinting
    ? (addedItems.get(selectedPrinting.id)?.quantity ?? 0) > 0
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
        setExpandedCardId(null);
      }
    } else if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) {
      const card = results[selectedIndex];
      if (card && !expandedCardId) {
        event.preventDefault();
        setExpandedCardId(card.cardId);
        setExpandedIndex(0);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results.length === 0) {
        return;
      }
      if (expandedCardId) {
        const card = results.find((r) => r.cardId === expandedCardId);
        if (card) {
          if (event.shiftKey) {
            handleUndo(card.printings[expandedIndex]);
          } else {
            handleAdd(card.printings[expandedIndex]);
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
    <div className="relative">
      {/* Card image preview — floats left of the dialog on desktop */}
      {previewPrinting && previewImageUrl && (
        <div className="absolute top-0 right-full mr-3 hidden w-48 lg:block">
          <div
            className="bg-muted aspect-card relative overflow-hidden"
            style={{ borderRadius: "5% / 3.6%" }}
          >
            {previewRotated ? (
              <div
                className="absolute top-1/2 left-1/2 overflow-hidden"
                style={LANDSCAPE_ROTATION_STYLE}
              >
                <img
                  src={getCardImageUrl(previewImageUrl, "thumbnail")}
                  alt={previewPrinting.card.name}
                  className="size-full object-cover"
                />
              </div>
            ) : (
              <img
                src={getCardImageUrl(previewImageUrl, "thumbnail")}
                alt={previewPrinting.card.name}
                className="absolute inset-0 w-full object-cover"
              />
            )}
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Add to "${collectionName}"...`}
          className={cn(
            "placeholder:text-muted-foreground h-11 w-full bg-transparent pl-10 text-sm outline-none",
            query ? "pr-9" : "pr-3",
          )}
          autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- command palette, always focused on open
        />
        {query && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
            onClick={clearSearch}
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="border-border border-t" />

      {/* Results */}
      <div ref={listRef} className="max-h-72 overflow-y-auto">
        {/* Empty state */}
        {query.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            Type a card name to add
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
              <button
                type="button"
                data-selected={isSelected || isExpanded}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  (isSelected || isExpanded) && "bg-accent",
                )}
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
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{card.cardName}</span>
                    {card.ownedCount > 0 && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        ×{card.ownedCount} owned
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">{shortCodes.join(" · ")}</div>
                </div>
                <ChevronRight
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              </button>

              {/* Expanded printing list */}
              {isExpanded && (
                <div className="bg-accent/50 border-accent py-1 pr-3 pl-3">
                  {card.printings.map((printing, printingIndex) => {
                    const isPrintingSelected = printingIndex === expandedIndex;
                    const ownedForPrinting = ownedCountByPrinting?.[printing.id] ?? 0;
                    const sessionAdded = addedItems.get(printing.id)?.quantity ?? 0;
                    return (
                      <div
                        key={printing.id}
                        data-selected={isPrintingSelected}
                        className={cn(
                          "flex w-full items-center rounded text-xs transition-colors",
                          isPrintingSelected && "bg-accent",
                        )}
                        onMouseEnter={() => setExpandedIndex(printingIndex)}
                      >
                        <button
                          type="button"
                          tabIndex={-1}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-left"
                          onClick={() => handleAdd(printing)}
                        >
                          <img
                            src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
                            alt={printing.rarity}
                            title={printing.rarity}
                            width={28}
                            height={28}
                            className="size-3.5 shrink-0"
                          />
                          <span className="text-muted-foreground w-16 shrink-0 font-mono text-[11px]">
                            {formatCardId(printing)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {formatPrintingLabel(printing, card.printings)}
                          </span>
                        </button>
                        {sessionAdded > 0 && (
                          <span className="shrink-0 text-[11px] text-green-600 dark:text-green-400">
                            {sessionAdded} new
                          </span>
                        )}
                        {sessionAdded > 0 && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => handleUndo(printing)}
                            className="text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                            aria-label={`Undo add ${printing.card.name}`}
                          >
                            <X className="size-3" />
                          </button>
                        )}
                        {ownedForPrinting > 0 && (
                          <span className="text-muted-foreground mr-2 shrink-0 text-[11px]">
                            ×{ownedForPrinting}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hints */}
      {results.length > 0 && (
        <>
          <div className="border-border border-t" />
          <div className="text-muted-foreground flex items-center gap-3 px-3 py-2 text-xs">
            <span>
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">↵</kbd>{" "}
              {expandedCardId ? "add" : "select"}
            </span>
            {expandedCardId && canUndoSelected && (
              <span>
                <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">⇧↵</kbd> undo
              </span>
            )}
            {expandedCardId && (
              <span>
                <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">←</kbd> back
              </span>
            )}
            <span>
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">esc</kbd> close
            </span>
          </div>
        </>
      )}
    </div>
  );
}
