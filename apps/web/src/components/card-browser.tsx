import type { Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useDeferredValue, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CardGrid } from "@/components/cards/card-grid";
import { AddCardPopover } from "@/components/collection/add-card-popover";
import { ActiveFilters } from "@/components/filters/active-filters";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardData } from "@/hooks/use-card-data";
import { useCardFilters } from "@/hooks/use-card-filters";
import { ApiError, useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useCreateSource, useSources } from "@/hooks/use-sources";
import { useSession } from "@/lib/auth-client";
import { useDisplayStore } from "@/stores/display-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

export function CardBrowser() {
  const showImages = useDisplayStore((s) => s.showImages);
  const cardFields = useDisplayStore((s) => s.cardFields);
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMaxColumns = useDisplayStore((s) => s.setMaxColumns);
  const { allCards, setInfoList, isLoading, error } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // Adding mode state
  const [adding] = useQueryState("adding", parseAsBoolean.withDefault(false));
  const [addingTo] = useQueryState("addingTo", parseAsString.withDefault(""));
  const { data: collections } = useCollections();
  const addingCollection = collections?.find((c) => c.id === addingTo);
  const { data: sources } = useSources();
  const navigate = useNavigate();

  const [addingSourceId, setAddingSourceId] = useState<string>("");
  const [creatingSource, setCreatingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const createSource = useCreateSource();
  const [popoverCard, setPopoverCard] = useState<Printing | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverCard) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverCard(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverCard]);

  const handleAddClick = (printing: Printing, anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, globalThis.innerWidth - 240)),
    });
    setPopoverCard(printing);
  };

  const {
    filters,
    ranges,
    sortBy,
    sortDir,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    toggleSigned,
    togglePromo,
    clearSigned,
    clearPromo,
    setRange,
    setSortBy,
    setSortDir,
    view,
    setView,
    filterState,
    searchScope,
    toggleSearchField,
  } = useCardFilters();

  const [selectedCard, setSelectedCard] = useState<Printing | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [physicalMaxColumns, setPhysicalMaxColumns] = useState(8);
  const [physicalMinColumns, setPhysicalMinColumns] = useState(1);
  const [autoColumns, setAutoColumns] = useState(5);

  // Lock body scroll when mobile overlay is active
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = globalThis.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailOpen]);

  const {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allCards,
    setInfoList,
    filters,
    sortBy,
    sortDir,
    view,
    ownedCountByPrinting: ownedCountByPrinting ?? undefined,
  });

  // Defer the expensive card grid re-render so the filter UI (badge highlight,
  // sheet close animation) responds immediately. The grid updates once React
  // has spare time after the urgent interactions are painted.
  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  // Close card detail when the user presses the browser back button on mobile
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = globalThis.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }

    history.pushState({ cardDetail: true }, "");

    globalThis.addEventListener("popstate", closeDetail);
    return () => globalThis.removeEventListener("popstate", closeDetail);
  }, [detailOpen]);

  const closeDetail = () => {
    setSelectedCard(null);
    setDetailOpen(false);
  };

  const handleCardClick = (printing: Printing) => {
    setSelectedCard(printing);
    setDetailOpen(true);
  };

  const siblingPrintings = selectedCard ? (printingsByCardId.get(selectedCard.card.id) ?? []) : [];

  const gridSelectedId =
    view === "cards" && selectedCard
      ? (deferredSortedCards.find((c) => c.card.id === selectedCard.card.id)?.id ?? selectedCard.id)
      : selectedCard?.id;

  const selectedIndex = selectedCard
    ? view === "cards"
      ? sortedCards.findIndex((c) => c.card.id === selectedCard.card.id)
      : sortedCards.findIndex((c) => c.id === selectedCard.id)
    : -1;

  const handlePrevCard =
    selectedIndex > 0 ? () => setSelectedCard(sortedCards[selectedIndex - 1]) : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < sortedCards.length - 1
      ? () => setSelectedCard(sortedCards[selectedIndex + 1])
      : undefined;

  const handleDetailClose = () => {
    // If we pushed a history entry for mobile, pop it instead of leaving a
    // stale entry in the stack.
    if (history.state?.cardDetail) {
      history.back();
    } else {
      closeDetail();
    }
  };

  if (error) {
    const healthStatus = error instanceof ApiError ? error.healthStatus : null;
    let title = "Failed to load cards.";
    let hint: string | null = null;

    if (healthStatus === "db_unreachable") {
      title = "The database isn't running.";
      hint = "docker compose up db -d";
    } else if (healthStatus === "db_not_migrated") {
      title = "The database hasn't been set up yet.";
      hint = "bun db:migrate && bun db:seed";
    } else if (healthStatus === "db_empty") {
      title = "The database is empty.";
      hint = "bun db:seed";
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <p className="text-muted-foreground">{title}</p>
        {hint && (
          <code className="bg-muted text-muted-foreground rounded px-3 py-1.5 text-sm">{hint}</code>
        )}
        <button
          type="button"
          className="text-sm underline"
          onClick={() => globalThis.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100svh-3.5rem)] space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex items-start gap-6">
          <Skeleton className="hidden wide:block h-[60svh] w-[400px] shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
              {Array.from({ length: 20 }, (_, i) => (
                <Skeleton key={i} className="aspect-[744/1039] rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100svh-3.5rem)] space-y-4">
      {adding && addingTo && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">
            Adding to: {addingCollection?.name ?? "Collection"}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Source:</span>
            {creatingSource ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = newSourceName.trim();
                  if (!trimmed) {
                    return;
                  }
                  createSource.mutate(
                    { name: trimmed },
                    {
                      onSuccess: (source) => {
                        setAddingSourceId(source.id);
                        setCreatingSource(false);
                        setNewSourceName("");
                      },
                    },
                  );
                }}
              >
                <input
                  type="text"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="e.g. Local Game Store"
                  className="h-7 w-40 rounded border bg-background px-2 text-xs"
                  autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline create
                  onBlur={() => {
                    if (!newSourceName.trim()) {
                      setCreatingSource(false);
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={createSource.isPending}
                >
                  Add
                </Button>
              </form>
            ) : (
              <select
                value={addingSourceId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCreatingSource(true);
                    setAddingSourceId("");
                  } else {
                    setAddingSourceId(e.target.value);
                  }
                }}
                className="h-7 rounded border bg-background px-2 text-xs"
              >
                <option value="">None</option>
                {sources?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="__new__">+ Create new…</option>
              </select>
            )}
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() =>
              void navigate({
                to: "/collections/$collectionId",
                params: { collectionId: addingTo },
              })
            }
          >
            Done
          </Button>
        </div>
      )}
      <FilterBar
        availableFilters={availableFilters}
        filterState={filterState}
        ranges={ranges}
        sortBy={sortBy}
        sortDir={sortDir}
        totalCards={totalUniqueCards}
        filteredCount={sortedCards.length}
        view={view}
        onViewChange={setView}
        hasActiveFilters={hasActiveFilters}
        searchScope={searchScope}
        onSearchChange={setSearch}
        onToggleFilter={toggleArrayFilter}
        onToggleSigned={toggleSigned}
        onTogglePromo={togglePromo}
        onRangeChange={setRange}
        onSortChange={setSortBy}
        onSortDirChange={setSortDir}
        onSearchScopeToggle={toggleSearchField}
        maxColumns={maxColumns ?? null}
        maxColumnsLimit={physicalMaxColumns}
        minColumnsLimit={physicalMinColumns}
        autoColumns={autoColumns}
        onMaxColumnsChange={setMaxColumns}
        setDisplayLabel={setDisplayLabel}
      />
      <ActiveFilters
        filterState={filterState}
        availableFilters={availableFilters}
        ranges={ranges}
        hasActiveFilters={hasActiveFilters}
        onToggleFilter={toggleArrayFilter}
        onClearRange={(key) => setRange(key, null, null)}
        onClearSigned={clearSigned}
        onClearPromo={clearPromo}
        onClearAll={clearAllFilters}
        onClearSearch={() => setSearch("")}
        setDisplayLabel={setDisplayLabel}
      />

      <div className="flex items-start gap-6">
        <FilterSidebar
          availableFilters={availableFilters}
          filterState={filterState}
          onToggleFilter={toggleArrayFilter}
          onToggleSigned={toggleSigned}
          onTogglePromo={togglePromo}
          ranges={ranges}
          onRangeChange={setRange}
          setDisplayLabel={setDisplayLabel}
        />
        <div
          className={`min-w-0 flex-1 transition-opacity duration-150 ${isGridStale ? "opacity-60" : "opacity-100"}`}
        >
          <CardGrid
            cards={deferredSortedCards}
            totalCards={allCards.length}
            setOrder={setInfoList}
            onCardClick={handleCardClick}
            onSiblingClick={handleCardClick}
            showImages={showImages}
            selectedCardId={gridSelectedId}
            priceRangeByCardId={priceRangeByCardId}
            view={view}
            siblingPrintings={siblingPrintings}
            printingsByCardId={printingsByCardId}
            cardFields={cardFields}
            maxColumns={maxColumns}
            onPhysicalMaxChange={setPhysicalMaxColumns}
            onPhysicalMinChange={setPhysicalMinColumns}
            onAutoColumnsChange={setAutoColumns}
            ownedCounts={ownedCounts}
            onAddCard={adding && addingTo ? handleAddClick : undefined}
          />
        </div>
        {selectedCard && detailOpen && (
          <Suspense fallback={<CardDetailSkeleton />}>
            <CardDetail
              printing={selectedCard}
              onClose={handleDetailClose}
              showImages={showImages}
              onPrevCard={handlePrevCard}
              onNextCard={handleNextCard}
              onTagClick={(tag) => {
                setSearch(`t:${tag}`);
                if (globalThis.matchMedia("(max-width: 767px)").matches) {
                  handleDetailClose();
                }
              }}
              onKeywordClick={(keyword) => {
                setSearch(`k:${keyword}`);
                if (globalThis.matchMedia("(max-width: 767px)").matches) {
                  handleDetailClose();
                }
              }}
              printings={siblingPrintings}
              onSelectPrinting={setSelectedCard}
            />
          </Suspense>
        )}
      </div>

      {/* Add card popover (portal) */}
      {popoverCard &&
        popoverPos &&
        addingTo &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[100]"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <AddCardPopover
              printing={popoverCard}
              printings={printingsByCardId.get(popoverCard.card.id)}
              collectionId={addingTo}
              sourceId={addingSourceId || undefined}
              onDone={() => setPopoverCard(null)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function CardDetailSkeleton() {
  return (
    <aside className="fixed inset-0 z-50 bg-background md:sticky md:inset-auto md:z-auto md:top-(--sticky-top) md:w-[400px] md:shrink-0 md:max-h-[calc(100vh-var(--sticky-top))] md:rounded-lg md:px-3">
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        <Skeleton className="aspect-[744/1039] w-full rounded-xl" />
        <div className="flex justify-center gap-1.5">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </aside>
  );
}
