import type { DeckZone } from "@openrift/shared";
import { EllipsisVerticalIcon, PencilIcon, PrinterIcon, Share2Icon, XIcon } from "lucide-react";
import { parseAsArrayOf, parseAsFloat, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DeckCardBrowser } from "@/components/deck/deck-card-browser";
import { DeckDndContext } from "@/components/deck/deck-dnd-context";
import { DeckExportDialog } from "@/components/deck/deck-export-dialog";
import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckRenameDialog } from "@/components/deck/deck-rename-dialog";
import { DeckFormatBadge, DeckSaveStatus } from "@/components/deck/deck-validation-banner";
import { DeckZonePanel } from "@/components/deck/deck-zone-panel";
import { ProxyExportDialog } from "@/components/deck/proxy-export-dialog";
import { Footer } from "@/components/layout/footer";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NestedSidebar,
  SidebarContent,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCards } from "@/hooks/use-cards";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import { useDeckDetail, useSaveDeckCards } from "@/hooks/use-decks";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { getCardImageUrl } from "@/lib/images";
import { cn, CONTAINER_WIDTH, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { useDeckBuilderStore, toDeckBuilderCard } from "@/stores/deck-builder-store";
import { useDisplayStore } from "@/stores/display-store";

const ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Chosen Champion",
  runes: "Runes",
  battlefield: "Battlefields",
  main: "Main Deck",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

interface DeckEditorPageProps {
  deckId: string;
}

function MobileSidebarHeader() {
  const { setOpenMobile } = useSidebar();

  return (
    <div className="flex items-center justify-between p-4 md:hidden">
      <h2 className="text-base font-medium">Deck Zones</h2>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpenMobile(false)}>
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </div>
  );
}

// Parsers for all filter keys so zone switches clear stale params
const zoneFilterParsers = {
  search: parseAsString.withDefault(""),
  sets: parseAsArrayOf(parseAsString, ",").withDefault([]),
  rarities: parseAsArrayOf(parseAsString, ",").withDefault([]),
  types: parseAsArrayOf(parseAsString, ",").withDefault([]),
  superTypes: parseAsArrayOf(parseAsString, ",").withDefault([]),
  domains: parseAsArrayOf(parseAsString, ",").withDefault([]),
  artVariants: parseAsArrayOf(parseAsString, ",").withDefault([]),
  finishes: parseAsArrayOf(parseAsString, ",").withDefault([]),
  energyMin: parseAsInteger,
  energyMax: parseAsInteger,
  mightMin: parseAsInteger,
  mightMax: parseAsInteger,
  powerMin: parseAsInteger,
  powerMax: parseAsInteger,
  priceMin: parseAsFloat,
  priceMax: parseAsFloat,
  signed: parseAsString,
  promo: parseAsString,
  banned: parseAsString,
  errata: parseAsString,
};

function buildZoneFilterUpdate(
  zone: DeckZone,
  deckCards: DeckBuilderCard[],
): Record<string, string[] | string | null> {
  const cleared: Record<string, string | string[] | null> = {
    search: null,
    sets: null,
    rarities: null,
    types: null,
    superTypes: null,
    domains: null,
    artVariants: null,
    finishes: null,
    energyMin: null,
    energyMax: null,
    mightMin: null,
    mightMax: null,
    powerMin: null,
    powerMax: null,
    priceMin: null,
    priceMax: null,
    signed: null,
    promo: null,
    banned: null,
    errata: null,
  };

  const legend = deckCards.find((card) => card.zone === "legend");

  switch (zone) {
    case "legend": {
      return { ...cleared, types: ["Legend"] };
    }
    case "champion": {
      const legendTag = legend?.tags[0];
      return {
        ...cleared,
        types: ["Unit"],
        superTypes: ["Champion"],
        search: legendTag ? `t:${legendTag}` : null,
      };
    }
    case "runes": {
      const legendDomains = legend ? legend.domains : [];
      return {
        ...cleared,
        types: ["Rune"],
        domains: legendDomains.length > 0 ? legendDomains : null,
      };
    }
    case "battlefield": {
      return { ...cleared, types: ["Battlefield"] };
    }
    case "main":
    case "sideboard": {
      // Don't filter by domains in URL — the browser does strict domain filtering
      // (all card domains must be within legend's domains, not just any match)
      return {
        ...cleared,
        types: ["Unit", "Spell", "Gear"],
      };
    }
    default: {
      return cleared;
    }
  }
}

const AUTO_SAVE_DELAY = 1000;

export function DeckEditorPage({ deckId }: DeckEditorPageProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={setTopBarSlot} className="px-3 pt-3" />
      <SidebarProvider defaultOpen>
        <DeckEditorContent deckId={deckId} topBarSlot={topBarSlot} />
      </SidebarProvider>
    </div>
  );
}

function DeckEditorContent({
  deckId,
  topBarSlot,
}: {
  deckId: string;
  topBarSlot: HTMLDivElement | null;
}) {
  const { data } = useDeckDetail(deckId);
  const { cardsById, allPrintings } = useCards();
  const init = useDeckBuilderStore((state) => state.init);
  const reset = useDeckBuilderStore((state) => state.reset);
  const storeId = useDeckBuilderStore((state) => state.deckId);
  const deckCards = useDeckBuilderStore((state) => state.cards);
  const isDirty = useDeckBuilderStore((state) => state.isDirty);
  const markSaved = useDeckBuilderStore((state) => state.markSaved);
  const [, setZoneFilters] = useQueryStates(zoneFilterParsers, { history: "push" });
  const setZoneFiltersRef = useRef(setZoneFilters);
  setZoneFiltersRef.current = setZoneFilters;
  const lastSuggestedZone = useRef<DeckZone | null>(null);
  const saveDeckCards = useSaveDeckCards();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const activeZone = useDeckBuilderStore((state) => state.activeZone);
  const [renameOpen, setRenameOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);

  // Ownership data
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "tcgplayer";
  const ownershipData = useDeckOwnership(
    deckCards,
    allPrintings,
    ownedCountByPrinting,
    marketplace,
  );

  // Initialize store when deck data loads or changes
  useEffect(() => {
    if (data && storeId !== deckId) {
      const builderCards = data.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null);
      init(deckId, data.deck.format, builderCards);
      lastSuggestedZone.current = null;
    }
  }, [data, deckId, storeId, init, cardsById]);

  // Auto-save: debounce saves so every change is persisted
  useEffect(() => {
    if (!isDirty || storeId !== deckId) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const currentCards = useDeckBuilderStore.getState().cards;
      saveDeckCards.mutate(
        {
          deckId,
          cards: currentCards.map((card) => ({
            cardId: card.cardId,
            zone: card.zone,
            quantity: card.quantity,
          })),
        },
        { onSuccess: () => markSaved() },
      );
    }, AUTO_SAVE_DELAY);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [isDirty, deckId, storeId, saveDeckCards, markSaved]);

  // Auto-suggest filters based on what's missing in the deck.
  useEffect(() => {
    if (storeId !== deckId) {
      return;
    }

    const hasLegend = deckCards.some((card) => card.zone === "legend");
    const hasChampion = deckCards.some((card) => card.zone === "champion");

    let nextSuggestion: DeckZone;
    if (hasLegend && hasChampion) {
      nextSuggestion = "main";
    } else if (hasLegend) {
      nextSuggestion = "champion";
    } else {
      nextSuggestion = "legend";
    }

    if (nextSuggestion === lastSuggestedZone.current) {
      return;
    }
    lastSuggestedZone.current = nextSuggestion;

    useDeckBuilderStore.getState().setActiveZone(nextSuggestion);
    void setZoneFiltersRef.current(buildZoneFilterUpdate(nextSuggestion, deckCards));
  }, [storeId, deckId, deckCards]);

  // Clear filters on unmount
  useEffect(
    () => () => {
      void setZoneFiltersRef.current({
        search: null,
        sets: null,
        rarities: null,
        types: null,
        superTypes: null,
        domains: null,
        artVariants: null,
        finishes: null,
        energyMin: null,
        energyMax: null,
        mightMin: null,
        mightMax: null,
        powerMin: null,
        powerMax: null,
        priceMin: null,
        priceMax: null,
        signed: null,
        promo: null,
        banned: null,
        errata: null,
      });
      reset();
    },
    [reset],
  );

  // Warn on navigation with unsaved changes
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const dirty = useDeckBuilderStore.getState().isDirty;
      if (dirty) {
        event.preventDefault();
      }
    };
    globalThis.addEventListener("beforeunload", handler);
    return () => globalThis.removeEventListener("beforeunload", handler);
  }, []);

  const handleZoneClick = (zone: DeckZone) => {
    useDeckBuilderStore.getState().setActiveZone(zone);
    void setZoneFilters(buildZoneFilterUpdate(zone, deckCards));
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [mouseY, setMouseY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hoveredCardId) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMouseY(event.clientY - rect.top);
      }
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, [hoveredCardId]);

  const hoveredCard = (() => {
    if (!hoveredCardId || isMobile) {
      return null;
    }
    // Pick canonical printing: short code → non-promo → normal finish
    const candidates = allPrintings
      .filter((entry) => entry.card.id === hoveredCardId)
      .toSorted(
        (a, b) =>
          a.shortCode.localeCompare(b.shortCode) ||
          Number(Boolean(a.promoType)) - Number(Boolean(b.promoType)) ||
          Number(a.finish !== "normal") - Number(b.finish !== "normal"),
      );
    const printing = candidates[0];
    const frontImage = printing?.images.find((img) => img.face === "front");
    if (!frontImage) {
      return null;
    }
    return {
      url: getCardImageUrl(frontImage.url, "full"),
      landscape: printing.card.type === "Battlefield",
    };
  })();

  const zoneCount = deckCards
    .filter((card) => card.zone === activeZone)
    .reduce((sum, card) => sum + card.quantity, 0);

  if (storeId !== deckId) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {topBarSlot &&
        createPortal(
          <PageTopBar>
            <PageTopBarBack to="/decks" />
            <PageTopBarTitle onToggleSidebar={toggleSidebar}>
              <span className="md:hidden">
                {ZONE_LABELS[activeZone]}
                <span className="text-muted-foreground ml-1">({zoneCount})</span>
              </span>
              <span className="hidden md:inline">{data.deck.name}</span>
            </PageTopBarTitle>
            <DeckFormatBadge />
            <PageTopBarActions>
              <DeckSaveStatus isDirty={isDirty} isSaving={saveDeckCards.isPending} />
              <div className="hidden md:flex md:items-center md:gap-1">
                <DeckExportDialog deckId={deckId} deckName={data.deck.name} isDirty={isDirty} />
                <ProxyExportDialog deckName={data.deck.name} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                    <PencilIcon className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <div className="md:hidden">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>
                      <Share2Icon className="size-4" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProxyOpen(true)}>
                      <PrinterIcon className="size-4" />
                      Proxies
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageTopBarActions>
          </PageTopBar>,
          topBarSlot,
        )}
      <DeckRenameDialog
        deckId={deckId}
        currentName={data.deck.name}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeckExportDialog
        deckId={deckId}
        deckName={data.deck.name}
        isDirty={isDirty}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <ProxyExportDialog open={proxyOpen} onOpenChange={setProxyOpen} deckName={data.deck.name} />
      {ownershipData && (
        <DeckMissingCardsDialog
          open={missingOpen}
          onOpenChange={setMissingOpen}
          missingCards={ownershipData.missingCards}
          totalMissingValue={ownershipData.missingValueCents}
          marketplace={marketplace}
        />
      )}
      <DeckDndContext>
        <div
          ref={containerRef}
          className={cn(CONTAINER_WIDTH, PAGE_PADDING_NO_TOP, "relative flex gap-4")}
        >
          <NestedSidebar
            className="mt-3 w-(--sidebar-width)!"
            extraOffset="calc(0.75rem + 2rem + 0.75rem)"
            style={{ "--sidebar-width": "18rem" } as React.CSSProperties}
          >
            <MobileSidebarHeader />
            <SidebarContent>
              <div className="p-3">
                <DeckZonePanel
                  onZoneClick={handleZoneClick}
                  onHoverCard={setHoveredCardId}
                  ownershipData={ownershipData}
                  marketplace={marketplace}
                  onViewMissing={() => setMissingOpen(true)}
                />
              </div>
            </SidebarContent>
          </NestedSidebar>

          {hoveredCard && (
            <div
              className={cn(
                "pointer-events-none absolute left-[19.5rem] z-50",
                hoveredCard.landscape ? "w-[560px]" : "w-[400px]",
              )}
              style={{ top: Math.max(0, mouseY - 96) }}
            >
              <img src={hoveredCard.url} alt="" className="w-full rounded-lg shadow-lg" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <DeckCardBrowser />
          </div>
        </div>
      </DeckDndContext>
      <Footer className="px-3 pb-3" />
    </div>
  );
}
