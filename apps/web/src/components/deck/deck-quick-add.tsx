import type { DeckFormat, DeckZone } from "@openrift/shared";
import { WellKnown, imageUrl } from "@openrift/shared";
import { ChevronRightIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { QuickAddPreview } from "@/components/collection/quick-add-preview";
import { useDeckUndo } from "@/components/deck/deck-undo-controls";
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
import { useCards } from "@/hooks/use-cards";
import { canAddRune, useDeckBuilderActions } from "@/hooks/use-deck-builder";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { searchCards } from "@/hooks/use-quick-add-search";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  catalogCardToDeckBuilderCard,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
} from "@/lib/deck-builder-card";
import { ZONE_LABELS, zoneExpected } from "@/lib/deck-zone-labels";
import { cn } from "@/lib/utils";

/** One place a result card can go, with the state the row needs to render. */
interface AddTarget {
  zone: DeckZone;
  /** Row label — "Main deck", "Set as Legend", … */
  label: string;
  /** Legend picks in constructed replace rather than add. */
  kind: "add" | "legend";
  /** The zone can't take the card right now (cap reached, wrong domain). */
  disabled: boolean;
  /** Copies of this card already in the zone. */
  count: number;
  /** The zone's format target, when it has one. */
  expected?: number;
}

/**
 * The zones a card can be quick-added to, natural home first. Legend cards in
 * constructed get the single replace action; everything else lists its real
 * zone options with live fullness checks, so Enter is always safe.
 * Exported for tests.
 * @returns The target rows for one search result.
 */
export function buildTargets(
  builderCard: DeckBuilderCard,
  deckCards: DeckBuilderCard[],
  format: DeckFormat,
): AddTarget[] {
  const freeform = format === WellKnown.deckFormat.FREEFORM;
  const isLegend = builderCard.cardTypes.includes(WellKnown.cardType.LEGEND);
  const hasLegend = deckCards.some((card) => card.zone === WellKnown.deckZone.LEGEND);

  if (isLegend && !freeform) {
    return [
      {
        zone: WellKnown.deckZone.LEGEND,
        label: hasLegend ? "Switch Legend" : "Set as Legend",
        kind: "legend",
        disabled: false,
        count: 0,
      },
    ];
  }

  const zoneCandidates: DeckZone[] = builderCard.cardTypes.includes(WellKnown.cardType.RUNE)
    ? [WellKnown.deckZone.RUNES]
    : builderCard.cardTypes.includes(WellKnown.cardType.BATTLEFIELD)
      ? [WellKnown.deckZone.BATTLEFIELD]
      : isLegend
        ? [WellKnown.deckZone.LEGEND]
        : builderCard.superTypes.includes(WellKnown.superType.CHAMPION)
          ? [WellKnown.deckZone.CHAMPION, WellKnown.deckZone.MAIN, WellKnown.deckZone.SIDEBOARD]
          : [WellKnown.deckZone.MAIN, WellKnown.deckZone.SIDEBOARD];

  return zoneCandidates
    .filter((zone) => isCardAllowedInZone(builderCard, zone))
    .map((zone) => {
      const full = isDeckZoneFullForDrag({
        zone,
        draggedCard: builderCard,
        fromZone: null,
        allCards: deckCards,
        format,
      });
      const runeMismatch =
        zone === WellKnown.deckZone.RUNES && !freeform && !canAddRune(builderCard, deckCards);
      return {
        zone,
        label: ZONE_LABELS[zone],
        kind: "add" as const,
        disabled: full || runeMismatch,
        count: deckCards
          .filter((card) => card.cardId === builderCard.cardId && card.zone === zone)
          .reduce((sum, card) => sum + card.quantity, 0),
        expected: zoneExpected(zone, format),
      };
    });
}

interface DeckQuickAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  format: DeckFormat;
  /** The live deck contents, for in-deck counts and fullness checks. */
  cards: DeckBuilderCard[];
}

/**
 * The deck editor's quick-add omnibar (Ctrl+K): type a card name, Enter adds
 * it to its natural zone without leaving the overview; ArrowRight picks
 * another target zone (sideboard, champion). Search and shell mirror the
 * collection quick-add palette; the add path is the deck builder's own, so
 * caps, rune rebalancing, and undo all behave exactly like the zone browser.
 * @returns The dialog (desktop) or drawer (mobile) host.
 */
export function DeckQuickAdd({ open, onOpenChange, deckId, format, cards }: DeckQuickAddProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerTitle className="sr-only">Add cards to the deck</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {open && <QuickAddInner deckId={deckId} format={format} cards={cards} isMobile />}
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
        <DialogTitle className="sr-only">Add cards to the deck</DialogTitle>
        {open && <QuickAddInner deckId={deckId} format={format} cards={cards} isMobile={false} />}
      </DialogContent>
    </Dialog>
  );
}

/** Keeps mouse interaction from stealing focus off the search input. */
function keepInputFocus(event: React.MouseEvent) {
  event.preventDefault();
}

/**
 * The count readout on a target row: its fill against the zone target, a bare
 * ×N where the zone has none, or "Full" when the zone rejects the card.
 * @returns The row's count text.
 */
function targetCountText(target: AddTarget): string {
  if (target.disabled) {
    return "Full";
  }
  if (target.expected === undefined) {
    return target.count > 0 ? `×${target.count}` : "";
  }
  return `${target.count}/${target.expected}`;
}

function QuickAddInner({
  deckId,
  format,
  cards,
  isMobile,
}: {
  deckId: string;
  format: DeckFormat;
  cards: DeckBuilderCard[];
  isMobile: boolean;
}) {
  const { printingsByCardId } = useCards();
  const { addCard, setLegend } = useDeckBuilderActions(deckId);
  const { canUndo, undo } = useDeckUndo(deckId);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [targetIndex, setTargetIndex] = useState(0);
  // Session-scoped undo depth: Shift+Enter only rolls back adds made from
  // this palette, never edits that predate opening it.
  const [addsSinceOpen, setAddsSinceOpen] = useState(0);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = searchCards(query, printingsByCardId);
  const clampedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));
  const selected = results[clampedIndex];
  const expanded =
    expandedCardId === null
      ? undefined
      : results.find((result) => result.cardId === expandedCardId);

  // Card totals across every zone, for the ×N in-deck badges.
  const inDeckByCardId = new Map<string, number>();
  for (const card of cards) {
    inDeckByCardId.set(card.cardId, (inDeckByCardId.get(card.cardId) ?? 0) + card.quantity);
  }

  const toBuilderCard = (cardId: string): DeckBuilderCard | undefined => {
    const printing = printingsByCardId.get(cardId)?.[0];
    if (!printing) {
      return undefined;
    }
    return catalogCardToDeckBuilderCard(cardId, printing.card);
  };

  const targetsFor = (cardId: string): AddTarget[] => {
    const builderCard = toBuilderCard(cardId);
    return builderCard ? buildTargets(builderCard, cards, format) : [];
  };

  /**
   * The Enter-key target: the first zone that can take the card, falling back
   * to the first row so a fully-capped card still reports something.
   * @returns The default target, or undefined without printings.
   */
  const defaultTarget = (targets: AddTarget[]): AddTarget | undefined =>
    targets.find((target) => !target.disabled) ?? targets[0];

  const performAdd = (cardId: string, cardName: string, target: AddTarget) => {
    const builderCard = toBuilderCard(cardId);
    if (!builderCard || target.disabled) {
      return;
    }
    if (target.kind === "legend") {
      // Constructed legends replace: prunes off-domain runes and auto-fills
      // the rune deck, exactly like the zone browser's Choose button.
      setLegend(builderCard);
      setLastAction(`Legend set to ${cardName}`);
    } else {
      addCard(builderCard, target.zone, 1);
      setLastAction(`Added ${cardName} to ${target.label}`);
    }
    setAddsSinceOpen((count) => count + 1);
  };

  const undoLastAdd = () => {
    if (addsSinceOpen <= 0 || !canUndo) {
      return;
    }
    undo();
    setAddsSinceOpen((count) => count - 1);
    setLastAction("Undid the last add");
  };

  const selectedTargets = selected ? targetsFor(selected.cardId) : [];

  const collapse = () => {
    setExpandedCardId(null);
    setTargetIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      if (expanded) {
        const targets = targetsFor(expanded.cardId);
        setTargetIndex((index) => Math.min(Math.max(index + delta, 0), targets.length - 1));
        return;
      }
      setSelectedIndex(Math.min(Math.max(clampedIndex + delta, 0), results.length - 1));
      return;
    }
    if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) {
      if (selected && !expanded && selectedTargets.length > 1) {
        event.preventDefault();
        setExpandedCardId(selected.cardId);
        setTargetIndex(0);
      } else if (event.key === "Tab") {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
      if (expanded) {
        event.preventDefault();
        collapse();
      } else if (event.key === "Tab") {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        undoLastAdd();
        return;
      }
      if (expanded) {
        const targets = targetsFor(expanded.cardId);
        const target = targets[Math.min(targetIndex, targets.length - 1)];
        if (target) {
          performAdd(expanded.cardId, expanded.cardName, target);
        }
        return;
      }
      if (selected) {
        const target = defaultTarget(selectedTargets);
        if (target) {
          performAdd(selected.cardId, selected.cardName, target);
        }
      }
      return;
    }
    if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        collapse();
        return;
      }
      if (query.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
      }
    }
  };

  // Keep the highlighted row in view as the keyboard moves it.
  useEffect(() => {
    const nodes = listRef.current?.querySelectorAll('[data-selected="true"]');
    const node = nodes ? [...nodes].at(-1) : undefined;
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [clampedIndex, targetIndex, expandedCardId]);

  // Preview the card the keyboard is on.
  const previewPrinting = (expanded ?? selected)?.defaultPrinting;
  const [failedImageId, setFailedImageId] = useState<string | null>(null);
  const rawPreviewImageId = previewPrinting?.images[0]?.imageId ?? null;
  const previewImageId = rawPreviewImageId === failedImageId ? null : rawPreviewImageId;
  const markPreviewFailed = () => setFailedImageId(rawPreviewImageId);

  return (
    <div className="relative flex min-h-0 flex-col">
      {/* Card image preview — above the input on mobile */}
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

      <InputGroup className="h-11 border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
        <InputGroupAddon align="inline-start">
          <SearchIcon className="text-muted-foreground size-4" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="text"
          aria-label="Add a card to the deck"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
            collapse();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add a card to the deck…"
          className="text-base sm:text-sm"
          autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- command palette, always focused on open
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => {
                setQuery("");
                collapse();
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <XIcon className="size-4" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="border-border border-t" />

      <div ref={listRef} className={cn("overflow-y-auto", isMobile ? "max-h-72" : "max-h-96")}>
        {query.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            Type a card name to add it to the deck
          </div>
        )}

        {query.length > 0 && results.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            No cards matching &ldquo;{query}&rdquo;
          </div>
        )}

        {results.map((card, index) => {
          const isSelected = index === clampedIndex && !expandedCardId;
          const isExpanded = expandedCardId === card.cardId;
          const inDeck = inDeckByCardId.get(card.cardId) ?? 0;
          const targets = targetsFor(card.cardId);
          const rowDefault = defaultTarget(targets);
          return (
            <div key={card.cardId}>
              <Pressable
                data-selected={isSelected || isExpanded}
                className={cn(
                  "group flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors",
                  isSelected || isExpanded ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
                onMouseDown={keepInputFocus}
                onClick={() => {
                  setSelectedIndex(index);
                  if (targets.length > 1) {
                    setExpandedCardId(isExpanded ? null : card.cardId);
                    setTargetIndex(0);
                    return;
                  }
                  if (rowDefault) {
                    performAdd(card.cardId, card.cardName, rowDefault);
                  }
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
                    {rowDefault
                      ? rowDefault.kind === "legend"
                        ? rowDefault.label
                        : rowDefault.disabled
                          ? `${rowDefault.label} · full`
                          : rowDefault.label
                      : "No printings"}
                  </div>
                </div>
                {inDeck > 0 && (
                  <span className="text-muted-foreground group-data-[selected=true]:text-accent-foreground/80 shrink-0 text-xs tabular-nums">
                    ×{inDeck} in deck
                  </span>
                )}
                {targets.length > 1 ? (
                  <ChevronRightIcon
                    className={cn(
                      "text-muted-foreground group-data-[selected=true]:text-accent-foreground size-4 shrink-0 transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                ) : (
                  <PlusIcon className="text-muted-foreground group-data-[selected=true]:text-accent-foreground size-4 shrink-0" />
                )}
              </Pressable>

              {isExpanded && (
                <div className="bg-muted/50 px-1 py-1">
                  {targets.map((target, index2) => {
                    const isTargetSelected = index2 === Math.min(targetIndex, targets.length - 1);
                    return (
                      <Pressable
                        key={target.zone}
                        data-selected={isTargetSelected}
                        disabled={target.disabled}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm transition-colors",
                          isTargetSelected && !target.disabled
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted",
                          target.disabled && "text-muted-foreground opacity-60",
                        )}
                        onMouseDown={keepInputFocus}
                        onClick={() => performAdd(card.cardId, card.cardName, target)}
                        onMouseEnter={() => setTargetIndex(index2)}
                      >
                        <PlusIcon className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">{target.label}</span>
                        {target.kind === "add" && (
                          <span className="shrink-0 text-xs tabular-nums">
                            {targetCountText(target)}
                          </span>
                        )}
                      </Pressable>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Last-action confirmation, in place of toasts. */}
      {lastAction && (
        <>
          <div className="border-border border-t" />
          <div className="text-muted-foreground px-3 py-1.5 text-xs">{lastAction}</div>
        </>
      )}

      {!isMobile && (
        <>
          <div className="border-border border-t" />
          <div className="text-muted-foreground flex items-center gap-3 px-3 py-2 text-xs">
            <span>
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> add
            </span>
            {selectedTargets.length > 1 && !expanded && (
              <span>
                <Kbd>→</Kbd> zone
              </span>
            )}
            {expanded && (
              <span>
                <Kbd>←</Kbd> back
              </span>
            )}
            {addsSinceOpen > 0 && (
              <span>
                <Kbd>⇧↵</Kbd> undo
              </span>
            )}
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </>
      )}
    </div>
  );
}
