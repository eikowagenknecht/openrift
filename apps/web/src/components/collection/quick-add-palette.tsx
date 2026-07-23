import type { CollectionResponse, Printing } from "@openrift/shared";
import { getOrientation, imageUrl, legendDisplayName } from "@openrift/shared";
import {
  ArrowRightIcon,
  ArrowRightLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
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
import {
  useBatchedAddCopies,
  useCopies,
  useDisposeCopies,
  useMoveCopies,
} from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePrices } from "@/hooks/use-prices";
import { searchCards } from "@/hooks/use-quick-add-search";
import { compactFormatterForMarketplace, formatCardId, priceColorClass } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import {
  buildMoveSources,
  groupMovableCopies,
  MOVE_FROM_ANYWHERE,
  movableCountsByPrinting,
} from "@/lib/move-sources";
import { summarizeBatchAdd } from "@/lib/summarize-batch-add";
import { cn } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";

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

/** One palette-session move, kept so Shift+Enter / the minus button can send the copy back where it came from. */
interface MoveRecord {
  copyId: string;
  printingId: string;
  fromCollectionId: string;
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
  const batchedAdd = useBatchedAddCopies({
    // Fires once per API batch, not per click, so a held-Enter burst produces
    // one aggregated toast instead of N "Added 1× Card" lines. Error toasts
    // are handled by the global mutation onError in query-client.ts.
    onBatchSuccess: (printingIds) => {
      const msg = summarizeBatchAdd(printingIds, (id) => {
        for (const list of printingsByCardId.values()) {
          const found = list.find((printing) => printing.id === id);
          if (found) {
            return legendDisplayName(found.card);
          }
        }
      });
      if (msg) {
        toast.success(msg);
      }
    },
  });
  const disposeCopies = useDisposeCopies();
  const addedItems = useAddModeStore((s) => s.addedItems);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const prices = usePrices();
  const favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader";
  const compactFmt = compactFormatterForMarketplace(favoriteMarketplace);

  // ── Move mode ──────────────────────────────────────────────────────
  // Instead of creating new copies, Move reassigns existing ones: From
  // (a source collection, or anywhere) → To (defaults to the collection
  // the palette opened on). Both sides are pickable, so the same palette
  // pulls cards into a fresh deckbox or clears the inbox out into one.
  const canMove = (collections?.length ?? 0) >= 2;
  const [mode, setMode] = useState<"add" | "move">("add");
  const [moveFrom, setMoveFrom] = useState<string>(MOVE_FROM_ANYWHERE);
  const [moveTo, setMoveTo] = useState<string>(collectionId);
  // Set by the swap button so a second click restores the exact previous
  // direction (a plain value swap can't restore "All collections").
  // Cleared when either dropdown is changed manually.
  const [swapUndo, setSwapUndo] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  // Which source collection Enter moves from, as an index into the selected
  // printing's source list (ArrowRight/Tab cycles it, clicking a chip sets it).
  const [sourceIndex, setSourceIndex] = useState(0);
  const moveCopies = useMoveCopies();
  // Live rows across all collections; PaletteInner only mounts while the
  // palette is open, so the subscription doesn't outlive it.
  const { data: allCopies } = useCopies();
  const inMoveMode = mode === "move" && canMove;
  const inboxId = collections?.find((col) => col.isInbox)?.id;
  const collectionDisplayName = (id: string) =>
    collections?.find((col) => col.id === id)?.name ?? "collection";
  const movableByPrinting = inMoveMode
    ? groupMovableCopies(allCopies, {
        excludeCollectionId: moveTo,
        onlyCollectionId: moveFrom === MOVE_FROM_ANYWHERE ? undefined : moveFrom,
      })
    : null;
  const movableCounts = movableByPrinting ? movableCountsByPrinting(movableByPrinting) : undefined;
  const fromItems = [
    { value: MOVE_FROM_ANYWHERE, label: "All collections" },
    ...(collections ?? [])
      .filter((col) => col.id !== moveTo)
      .map((col) => ({ value: col.id, label: col.name })),
  ];
  const toItems = (collections ?? [])
    .filter((col) => col.id !== moveFrom)
    .map((col) => ({ value: col.id, label: col.name }));

  const results = searchCards(query, printingsByCardId, {
    // In move mode the ×N badges show what's movable in the current
    // From scope, not the global owned count.
    ownedCountByPrinting: inMoveMode ? (movableCounts ?? {}) : ownedCountByPrinting,
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
  const previewThumbnail = previewImageId ? imageUrl(previewImageId, "full") : null;
  // The mobile preview renders at a smaller, fixed width, so a lighter variant
  // is plenty (400w covers ~160px CSS at DPR 2).
  const previewThumbnailMobile = previewImageId ? imageUrl(previewImageId, "400w") : null;
  const markPreviewFailed = () => setFailedImageId(rawPreviewImageId);
  const previewRotated = previewPrinting
    ? needsCssRotation(getOrientation(previewPrinting.card.types))
    : false;

  // Clamp selection when results change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, results.length - 1)));
    setExpandedCardId(null);
  }, [results.length]);

  // A new printing row, direction, or target starts back at the default source.
  useEffect(() => {
    setSourceIndex(0);
  }, [expandedCardId, expandedIndex, moveFrom, moveTo]);

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
    // Increment pending so the "N new" badge reflects the click immediately,
    // not after the 300ms batch + API round-trip completes.
    useAddModeStore.getState().incrementPending(printing);
    try {
      const { result } = batchedAdd.add(printing.id, collectionId);
      const real = await result;
      useAddModeStore.getState().recordAdd(printing, real.id);
      const input = inputRef.current;
      if (input) {
        input.focus();
      }
      // Success toast is fired once per batch by onBatchSuccess above; error
      // toast is fired by the global mutation handler in query-client.ts.
    } catch {
      // Swallow: the global onError already toasted; rethrowing would
      // surface as an uncaught promise warning.
    }
    useAddModeStore.getState().decrementPending(printing.id);
  };

  const handleUndo = async (printing: Printing) => {
    const entry = useAddModeStore.getState().addedItems.get(printing.id);
    if (!entry || entry.copyIds.length === 0) {
      return;
    }
    const copyIdToRemove = entry.copyIds.at(-1);
    if (!copyIdToRemove) {
      return;
    }
    // Pop from the session store optimistically so rapid undo clicks advance
    // to the next copyId instead of racing on the same one. disposeCopies
    // already optimistically removes the row from the copies collection.
    useAddModeStore.getState().recordUndo(printing.id);
    try {
      await disposeCopies.mutateAsync({ copyIds: [copyIdToRemove] });
      toast.success(`Removed 1× ${legendDisplayName(printing.card)}`);
      const input = inputRef.current;
      if (input) {
        input.focus();
      }
    } catch {
      // Roll the session store back; the error toast is fired once by the
      // global mutation handler in query-client.ts (a second toast here would
      // duplicate it).
      useAddModeStore.getState().recordAdd(printing, copyIdToRemove);
    }
  };

  const handleMoveOne = async (printing: Printing, sourceCollectionId?: string) => {
    const sources = buildMoveSources(movableByPrinting?.get(printing.id) ?? [], inboxId);
    const source = sourceCollectionId
      ? sources.find((s) => s.collectionId === sourceCollectionId)
      : sources[Math.min(sourceIndex, sources.length - 1)];
    const copyId = source?.copyIds[0];
    if (!source || !copyId) {
      return;
    }
    const record: MoveRecord = {
      copyId,
      printingId: printing.id,
      fromCollectionId: source.collectionId,
    };
    setMoveHistory((prev) => [...prev, record]);
    try {
      await moveCopies.mutateAsync({ copyIds: [copyId], toCollectionId: moveTo });
      // Stable id per printing: a held Enter replaces the toast instead of
      // stacking one per keypress. Error toasts come from the global
      // mutation onError in query-client.ts.
      toast.success(
        `Moved 1× ${legendDisplayName(printing.card)} to ${collectionDisplayName(moveTo)}`,
        { id: `palette-move-${printing.id}` },
      );
      inputRef.current?.focus();
    } catch {
      // Roll the session history back; the global onError already toasted.
      setMoveHistory((prev) => prev.filter((entry) => entry !== record));
    }
  };

  const handleUndoMove = async (printing: Printing) => {
    const record = moveHistory.findLast((entry) => entry.printingId === printing.id);
    if (!record) {
      return;
    }
    setMoveHistory((prev) => prev.filter((entry) => entry !== record));
    try {
      await moveCopies.mutateAsync({
        copyIds: [record.copyId],
        toCollectionId: record.fromCollectionId,
      });
      toast.success(
        `Moved 1× ${legendDisplayName(printing.card)} back to ${collectionDisplayName(record.fromCollectionId)}`,
        { id: `palette-move-${printing.id}` },
      );
      inputRef.current?.focus();
    } catch {
      setMoveHistory((prev) => [...prev, record]);
    }
  };

  const handleSwapDirection = () => {
    if (swapUndo) {
      setMoveFrom(swapUndo.from);
      setMoveTo(swapUndo.to);
      setSwapUndo(null);
      return;
    }
    const previous = { from: moveFrom, to: moveTo };
    if (moveFrom === MOVE_FROM_ANYWHERE) {
      // "All collections" can't become the target — anchor From to the old
      // target and default the destination to the inbox (or the first other
      // collection when the inbox IS the old target, i.e. clearing it out).
      const target =
        inboxId && inboxId !== moveTo ? inboxId : collections?.find((col) => col.id !== moveTo)?.id;
      if (!target) {
        return;
      }
      setMoveFrom(moveTo);
      setMoveTo(target);
    } else {
      setMoveFrom(moveTo);
      setMoveTo(moveFrom);
    }
    setSwapUndo(previous);
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
      ? new Set(
          (movableByPrinting?.get(selectedPrinting.id) ?? []).map((copy) => copy.collectionId),
        ).size
      : 0;
  const canUndoSelected = selectedPrinting
    ? inMoveMode
      ? moveHistory.some((entry) => entry.printingId === selectedPrinting.id)
      : (addedItems.get(selectedPrinting.id)?.quantity ?? 0) > 0
    : false;

  // Handled on the palette root, not the input: after clicking a tab (or any
  // other control) focus leaves the input, and the shortcut should keep
  // working from anywhere inside the palette. React synthetic events bubble
  // here even from portaled popups.
  const handleModeShortcut = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m" && canMove) {
      event.preventDefault();
      setMode((prev) => (prev === "add" ? "move" : "add"));
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
          const sources = buildMoveSources(
            movableByPrinting?.get(selectedPrinting.id) ?? [],
            inboxId,
          );
          const activeSource = Math.min(sourceIndex, sources.length - 1);
          if (activeSource > 0) {
            setSourceIndex(activeSource - 1);
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
          const sources = buildMoveSources(
            movableByPrinting?.get(selectedPrinting.id) ?? [],
            inboxId,
          );
          if (sources.length > 1) {
            event.preventDefault();
            setSourceIndex((prev) =>
              Math.min(Math.min(prev, sources.length - 1) + 1, sources.length - 1),
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
            void (inMoveMode ? handleUndoMove(printing) : handleUndo(printing));
          } else {
            void (inMoveMode ? handleMoveOne(printing) : handleAdd(printing));
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
      {/* Card image preview — shown at the top of the drawer on mobile, where
          there's no off-canvas space for the desktop side pane. */}
      {isMobile && previewPrinting && previewThumbnailMobile && (
        <div className="mb-3 flex justify-center">
          <div
            className="bg-muted aspect-card relative w-40 overflow-hidden"
            style={{ borderRadius: "5% / 3.6%" }}
          >
            {previewRotated ? (
              <div
                className="absolute top-1/2 left-1/2 overflow-hidden"
                style={LANDSCAPE_ROTATION_STYLE}
              >
                <img
                  src={previewThumbnailMobile}
                  alt={legendDisplayName(previewPrinting.card)}
                  className="size-full object-cover"
                  onError={markPreviewFailed}
                />
              </div>
            ) : (
              <img
                src={previewThumbnailMobile}
                alt={legendDisplayName(previewPrinting.card)}
                className="absolute inset-0 w-full object-cover"
                onError={markPreviewFailed}
              />
            )}
          </div>
        </div>
      )}

      {/* Card image preview — floats left of the dialog on desktop */}
      {previewPrinting && previewThumbnail && (
        <div className="absolute top-0 right-full mr-3 hidden w-96 lg:block">
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
                  src={previewThumbnail}
                  alt={legendDisplayName(previewPrinting.card)}
                  className="size-full object-cover"
                  onError={markPreviewFailed}
                />
              </div>
            ) : (
              <img
                src={previewThumbnail}
                alt={legendDisplayName(previewPrinting.card)}
                className="absolute inset-0 w-full object-cover"
                onError={markPreviewFailed}
              />
            )}
          </div>
        </div>
      )}

      {/* Mode toggle + move direction. The drawer already pads its content
          (p-4), so the horizontal inset applies on desktop only. */}
      {canMove && (
        <div className={cn("flex flex-col gap-2 pb-1", !isMobile && "px-3 pt-3")}>
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value as "add" | "move");
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
                {!isMobile && mode === "move" && (
                  <Kbd className="pointer-events-none opacity-60">Ctrl+M</Kbd>
                )}
              </TabsTrigger>
              <TabsTrigger value="move">
                Move
                {!isMobile && mode === "add" && (
                  <Kbd className="pointer-events-none opacity-60">Ctrl+M</Kbd>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {inMoveMode && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">from</span>
              <Select
                items={fromItems}
                value={moveFrom}
                onValueChange={(value) => {
                  if (value) {
                    setMoveFrom(value);
                    setSwapUndo(null);
                  }
                }}
              >
                <SelectTrigger aria-label="Move from" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fromItems.map((item) => (
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
                onClick={handleSwapDirection}
                aria-label="Swap move direction"
              >
                <ArrowRightLeftIcon />
              </Button>
              <span className="text-muted-foreground text-xs">to</span>
              <Select
                items={toItems}
                value={moveTo}
                onValueChange={(value) => {
                  if (value) {
                    setMoveTo(value);
                    setSwapUndo(null);
                  }
                }}
              >
                <SelectTrigger aria-label="Move to" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toItems.map((item) => (
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
              ? `Move card to ${collectionDisplayName(moveTo)}`
              : `Add card to ${collectionName}`
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            inMoveMode
              ? `Move to "${collectionDisplayName(moveTo)}"...`
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
                    const movableForPrinting = movableCounts?.[printing.id] ?? 0;
                    const movedThisSession = inMoveMode
                      ? moveHistory.filter((entry) => entry.printingId === printing.id).length
                      : 0;
                    // Source breakdown only for the selected row — it drives
                    // both the per-source chips (From = anywhere) and the
                    // "nothing to move" note.
                    const sources =
                      inMoveMode && isPrintingSelected
                        ? buildMoveSources(movableByPrinting?.get(printing.id) ?? [], inboxId)
                        : null;
                    const rarityIcon = getFilterIconPath("rarities", printing.rarity);
                    const price = prices.get(printing.id, favoriteMarketplace);
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
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5">
                            {rarityIcon && (
                              <img
                                src={rarityIcon}
                                alt={printing.rarity}
                                title={printing.rarity}
                                width={28}
                                height={28}
                                className="size-3.5 shrink-0"
                              />
                            )}
                            <span className="text-muted-foreground group-data-[selected=true]:text-accent-foreground/80 text-2xs w-[3.5rem] shrink-0 font-mono">
                              {formatCardId(printing)}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              <PrintingVariantLabel printing={printing} siblings={card.printings} />
                            </span>
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
                            <div className="mr-1.5 ml-1 flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={keepInputFocus}
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => handleUndoMove(printing)}
                                disabled={movedThisSession === 0}
                                aria-label={`Undo move ${legendDisplayName(printing.card)}`}
                              >
                                <MinusIcon />
                              </Button>
                              <span
                                className={cn(
                                  "text-2xs w-5 text-center tabular-nums",
                                  isPrintingSelected
                                    ? movedThisSession > 0
                                      ? "text-accent-foreground"
                                      : "text-accent-foreground/80"
                                    : movedThisSession > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {movableForPrinting}
                              </span>
                              <Button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={keepInputFocus}
                                size="icon-xs"
                                onClick={() => handleMoveOne(printing)}
                                disabled={movableForPrinting === 0}
                                aria-label={`Move ${legendDisplayName(printing.card)}`}
                                className="group-data-[selected=true]:bg-accent-foreground group-data-[selected=true]:text-accent group-data-[selected=true]:hover:bg-accent-foreground/80"
                              >
                                <ArrowRightIcon />
                              </Button>
                            </div>
                          ) : (
                            <div className="mr-1.5 ml-1 flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={keepInputFocus}
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => handleUndo(printing)}
                                disabled={sessionAdded === 0}
                                aria-label={`Undo add ${legendDisplayName(printing.card)}`}
                              >
                                <MinusIcon />
                              </Button>
                              <span
                                className={cn(
                                  "text-2xs w-5 text-center tabular-nums",
                                  isPrintingSelected
                                    ? sessionAdded > 0
                                      ? "text-accent-foreground"
                                      : "text-accent-foreground/80"
                                    : sessionAdded > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {ownedForPrinting}
                              </span>
                              <Button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={keepInputFocus}
                                size="icon-xs"
                                onClick={() => handleAdd(printing)}
                                aria-label={`Add ${legendDisplayName(printing.card)}`}
                                className="group-data-[selected=true]:bg-accent-foreground group-data-[selected=true]:text-accent group-data-[selected=true]:hover:bg-accent-foreground/80"
                              >
                                <PlusIcon />
                              </Button>
                            </div>
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
                                    chipIndex === Math.min(sourceIndex, sources.length - 1);
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
                                        setSourceIndex(chipIndex);
                                        void handleMoveOne(printing, source.collectionId);
                                      }}
                                    >
                                      {collectionDisplayName(source.collectionId)} ×
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
    </div>
  );
}
