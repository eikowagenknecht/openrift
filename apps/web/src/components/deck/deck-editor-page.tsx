import { useDndContext } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { EllipsisVerticalIcon, PencilIcon, PrinterIcon, Share2Icon, XIcon } from "lucide-react";
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
import { useFilterActions } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import { useDeckDetail, useSaveDeckCards } from "@/hooks/use-decks";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useSession } from "@/lib/auth-session";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
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

function HoveredCardPreview({
  hoveredCard,
  mouseY,
}: {
  hoveredCard: { thumbnailUrl: string; fullUrl: string; landscape: boolean } | null;
  mouseY: number;
}) {
  const { active } = useDndContext();
  const [fullLoaded, setFullLoaded] = useState(false);
  const fullUrl = hoveredCard?.fullUrl ?? null;

  // Reset the crossfade whenever the hovered card changes so the next
  // hover starts from the cached thumbnail and only fades in once the
  // new full-resolution image has finished loading.
  useEffect(() => {
    setFullLoaded(false);
  }, [fullUrl]);

  if (!hoveredCard || active) {
    return null;
  }
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-[19.5rem] z-50",
        hoveredCard.landscape ? "w-[560px]" : "w-[400px]",
      )}
      style={{ top: Math.max(0, mouseY - 96) }}
    >
      <div className="relative">
        <img src={hoveredCard.thumbnailUrl} alt="" className="w-full rounded-lg shadow-lg" />
        <img
          src={hoveredCard.fullUrl}
          alt=""
          onLoad={() => setFullLoaded(true)}
          className={cn(
            "absolute inset-0 w-full rounded-lg shadow-lg transition-opacity duration-150",
            fullLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
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
  const { getPreferredPrinting } = usePreferredPrinting();
  const init = useDeckBuilderStore((state) => state.init);
  const reset = useDeckBuilderStore((state) => state.reset);
  const storeId = useDeckBuilderStore((state) => state.deckId);
  const deckCards = useDeckBuilderStore((state) => state.cards);
  const isDirty = useDeckBuilderStore((state) => state.isDirty);
  const markSaved = useDeckBuilderStore((state) => state.markSaved);
  const saveDeckCards = useSaveDeckCards();
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
    }
  }, [data, deckId, storeId, init, cardsById]);

  // Auto-save: debounce saves so every change is persisted
  const debouncedSave = useDebouncedCallback(
    () => {
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
    },
    { wait: AUTO_SAVE_DELAY },
  );

  useEffect(() => {
    if (isDirty && storeId === deckId) {
      debouncedSave();
    }
  }, [isDirty, deckId, storeId, debouncedSave]);

  // Reset store on unmount
  useEffect(
    () => () => {
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

  const { setArrayFilters, setSearch } = useFilterActions();

  const handleZoneClick = (zone: DeckZone) => {
    // Clear search from a previous zone (e.g. champion tag search),
    // then apply the new preset.
    setSearch("");

    const legend = deckCards.find((card) => card.zone === "legend");
    const legendDomains = legend?.domains ?? [];
    const domainsWithColorless = legendDomains.length > 0 ? [...legendDomains, "Colorless"] : [];

    switch (zone) {
      case "legend": {
        setArrayFilters({ types: ["Legend"], superTypes: [], domains: [] });
        break;
      }
      case "champion": {
        setArrayFilters({
          types: ["Unit"],
          superTypes: ["Champion"],
          domains: domainsWithColorless,
        });
        if (legend?.tags[0]) {
          setSearch(`t:${legend.tags[0]}`);
        }
        break;
      }
      case "runes": {
        setArrayFilters({ types: ["Rune"], superTypes: [], domains: legendDomains });
        break;
      }
      case "battlefield": {
        setArrayFilters({ types: ["Battlefield"], superTypes: [], domains: [] });
        break;
      }
      case "main":
      case "sideboard": {
        setArrayFilters({
          types: ["Unit", "Spell", "Gear"],
          superTypes: [],
          domains: domainsWithColorless,
        });
        break;
      }
      case "overflow": {
        setArrayFilters({
          types: ["Unit", "Spell", "Gear", "Battlefield"],
          superTypes: [],
          domains: domainsWithColorless,
        });
        break;
      }
    }

    useDeckBuilderStore.getState().setActiveZone(zone);
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
    const printing = getPreferredPrinting(hoveredCardId);
    if (!printing) {
      return null;
    }
    const frontImage = printing.images.find((img) => img.face === "front");
    if (!frontImage) {
      return null;
    }
    return {
      thumbnailUrl: frontImage.thumbnail,
      fullUrl: frontImage.full,
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
                {activeZone ? ZONE_LABELS[activeZone] : "Deck"}
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
        <div ref={containerRef} className={cn(CONTAINER_WIDTH, "relative flex gap-4 px-3")}>
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

          <HoveredCardPreview hoveredCard={hoveredCard} mouseY={mouseY} />

          <div className="flex min-w-0 flex-1 flex-col pb-3">
            <div className="flex-1">
              <DeckCardBrowser />
            </div>
            <Footer />
          </div>
        </div>
      </DeckDndContext>
    </div>
  );
}
