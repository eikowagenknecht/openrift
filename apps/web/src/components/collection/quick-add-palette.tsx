import type { Printing } from "@openrift/shared";
import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { searchCards } from "@/hooks/use-quick-add-search";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      <DialogPortal>
        <DialogOverlay />
        <div
          data-slot="dialog-content"
          className="fixed top-[20%] left-1/2 z-50 w-full max-w-md -translate-x-1/2 outline-none"
        >
          <DialogTitle className="sr-only">Quick add to {collectionName}</DialogTitle>
          <div className="bg-background ring-foreground/10 overflow-hidden rounded-xl shadow-lg ring-1">
            <PaletteInner
              collectionId={collectionId}
              collectionName={collectionName}
              printingsByCardId={printingsByCardId}
              ownedCountByPrinting={ownedCountByPrinting}
            />
          </div>
        </div>
      </DialogPortal>
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
  const addCopies = useAddCopies();

  const results = searchCards(query, printingsByCardId, ownedCountByPrinting);

  // Clamp selection when results change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, results.length - 1)));
    setExpandedCardId(null);
  }, [results.length]);

  // Scroll selected item into view
  useEffect(() => {
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
        onSuccess: () => {
          toast.success(`Added 1× ${printing.card.name}`);
          inputRef.current?.focus();
        },
        onError: () => {
          toast.error(`Failed to add ${printing.card.name}`);
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

  const handleKeyDown = (event: React.KeyboardEvent) => {
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
      if (card && card.printings.length > 1 && !expandedCardId) {
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
          handleAdd(card.printings[expandedIndex]);
        }
      } else {
        const card = results[selectedIndex];
        if (card) {
          if (card.printings.length > 1) {
            setExpandedCardId(card.cardId);
            setExpandedIndex(0);
          } else {
            handleAdd(card.defaultPrinting);
          }
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
    <>
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
          const uniqueSets = [...new Set(card.printings.map((p) => p.setSlug.toUpperCase()))];

          return (
            <div key={card.cardId}>
              <button
                type="button"
                data-selected={isSelected || isExpanded}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  (isSelected || isExpanded) && "bg-accent",
                )}
                onClick={() => {
                  if (card.printings.length > 1) {
                    setSelectedIndex(index);
                    setExpandedCardId(isExpanded ? null : card.cardId);
                    setExpandedIndex(0);
                  } else {
                    handleAdd(card.defaultPrinting);
                  }
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
                  <div className="text-muted-foreground text-xs">{uniqueSets.join(" · ")}</div>
                </div>
                {card.printings.length > 1 && (
                  <ChevronRight
                    className={cn(
                      "text-muted-foreground size-4 shrink-0 transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                )}
              </button>

              {/* Expanded printing list */}
              {isExpanded && (
                <div className="bg-accent/50 border-accent py-1 pr-3 pl-6">
                  {card.printings.map((printing, printingIndex) => {
                    const isPrintingSelected = printingIndex === expandedIndex;
                    const ownedForPrinting = ownedCountByPrinting?.[printing.id] ?? 0;
                    return (
                      <button
                        key={printing.id}
                        type="button"
                        data-selected={isPrintingSelected}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                          isPrintingSelected && "bg-accent",
                        )}
                        onClick={() => handleAdd(printing)}
                        onMouseEnter={() => setExpandedIndex(printingIndex)}
                      >
                        <span className="text-muted-foreground w-16 shrink-0 font-mono text-[11px]">
                          {formatCardId(printing)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {formatPrintingLabel(printing, card.printings)}
                        </span>
                        <img
                          src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
                          alt={printing.rarity}
                          title={printing.rarity}
                          width={28}
                          height={28}
                          className="size-3.5 shrink-0"
                        />
                        {ownedForPrinting > 0 && (
                          <span className="text-muted-foreground shrink-0">
                            ×{ownedForPrinting}
                          </span>
                        )}
                      </button>
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
            {results.some((r) => r.printings.length > 1) && (
              <span>
                <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">→</kbd>{" "}
                printings
              </span>
            )}
            <span>
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">esc</kbd> close
            </span>
          </div>
        </>
      )}
    </>
  );
}
