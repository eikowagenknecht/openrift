import type { DeckListItemResponse, DeckResponse } from "@openrift/shared/types/api/deck";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, CircleHelpIcon, PlusIcon, SwordsIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cardLinkVariants } from "@/components/ui/card-link";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCards } from "@/hooks/use-cards";
import { useDeckFolders } from "@/hooks/use-deck-folders";
import { useDeckListFilters } from "@/hooks/use-deck-list-filters";
import { decksQueryOptions, useCreateDeck, useSaveDeckCards } from "@/hooks/use-decks";
import { useDeckFormatList, useEnumOrders } from "@/hooks/use-enums";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useUserId } from "@/lib/auth-session";
import type { CollapsedDeckEntry } from "@/lib/deck-family";
import { collapseFamilies } from "@/lib/deck-family";
import type { DeckListItemWithNames } from "@/lib/deck-list-utils";
import {
  availableDomainsFrom,
  deckListEnrichment,
  enrichItem,
  filterAvailabilityFrom,
  filterCountsFrom,
  filterDecks,
  groupDecks,
  partitionByArchived,
  sortDecks,
} from "@/lib/deck-list-utils";
import { localDeckToListItem } from "@/lib/local-deck-list-item";
import {
  buildSampleDeckCards,
  SAMPLE_DECK_FORMAT,
  SAMPLE_DECK_NAME,
  sampleDeckKeyCards,
} from "@/lib/sample-deck";
import { cn, PAGE_WIDTH, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import { useDeckListPrefsStore, useDeckListViewPrefs } from "@/stores/deck-list-prefs-store";
import { useLocalDecksStore } from "@/stores/local-decks-store";

import { ClaimLocalDecksPrompt } from "./claim-local-decks-prompt";
import { DeckListRow } from "./deck-list-row";
import { DeckListToolbar } from "./deck-list-toolbar";
import { DeckTile, FannedPreview } from "./deck-tile";
import { LocalDeckSaveBanner, LocalDeckSaveNote } from "./local-save-hint";

function CreateDeckDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const userId = useUserId();
  const createDeck = useCreateDeck();
  const createLocalDeck = useLocalDecksStore((state) => state.createDeck);
  const { formats, labels: formatLabels } = useDeckFormatList();
  const [name, setName] = useState("New Deck");
  const [format, setFormat] = useState<string>(formats[0]?.slug ?? "");

  const handleCreate = () => {
    if (!userId) {
      const localId = createLocalDeck(format, name);
      void navigate({ to: "/decks/$deckId", params: { deckId: localId } });
      onOpenChange(false);
      return;
    }
    createDeck.mutate(
      { name, format },
      {
        onSuccess: (data) => {
          const deck = data as DeckResponse;
          void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>New deck</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="deck-name">Name</Label>
              <Input
                id="deck-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- dialog input should auto-focus for quick interaction
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="deck-format">Format</Label>
              <Select
                value={format}
                onValueChange={(value) => {
                  if (value !== null) {
                    setFormat(value);
                  }
                }}
              >
                <SelectTrigger id="deck-format">
                  <SelectValue>{(value: string) => formatLabels[value] ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {formats.map((entry) => (
                    <SelectItem key={entry.slug} value={entry.slug}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Link
              to="/help/$slug"
              params={{ slug: "deck-building" }}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              <CircleHelpIcon className="size-3.5" />
              New to deck building? See how it works →
            </Link>
            {!userId && <LocalDeckSaveNote />}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createDeck.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function useEnrichedItems(items: DeckListItemResponse[]): DeckListItemWithNames[] {
  const { getPreferredPrinting } = usePreferredPrinting();
  return items.map((item) => {
    const legendCard = item.legendCardId
      ? getPreferredPrinting(item.legendCardId)?.card
      : undefined;
    const championCard = item.championCardId
      ? getPreferredPrinting(item.championCardId)?.card
      : undefined;
    return enrichItem(item, deckListEnrichment(legendCard, championCard));
  });
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  if (label === "") {
    return null;
  }
  return (
    <div className="text-muted-foreground mt-2 mb-1 flex items-center gap-2 text-sm font-medium">
      <span>{label}</span>
      <span className="text-xs tabular-nums">({count})</span>
    </div>
  );
}

export function DeckListPage() {
  // Server decks load only when signed in; local decks always render, gated
  // behind hydration. Non-suspense so a logged-out visitor doesn't suspend.
  const userId = useUserId();
  const serverQuery = useQuery({ ...decksQueryOptions(userId ?? ""), enabled: Boolean(userId) });
  const serverItems = serverQuery.data ?? [];

  const hydrated = useHydrated();
  const localDecks = useLocalDecksStore((state) => state.decks);
  const { cardsById, allPrintings } = useCards();
  const { getPreferredFrontImage } = usePreferredPrinting();
  const navigate = useNavigate();
  const createDeck = useCreateDeck();
  const saveDeckCards = useSaveDeckCards();
  const [creatingSample, setCreatingSample] = useState(false);
  const { orders, labels } = useEnumOrders();
  const localItems: DeckListItemResponse[] =
    hydrated && Object.keys(localDecks).length > 0
      ? Object.values(localDecks).map((deck) =>
          localDeckToListItem(deck, {
            cardsById,
            cardTypeOrder: orders.cardTypes,
            domainOrder: orders.domains,
          }),
        )
      : [];

  const deckItems: DeckListItemResponse[] = [...localItems, ...serverItems];
  const [createOpen, setCreateOpen] = useState(false);

  const sampleCards =
    deckItems.length === 0 || creatingSample ? buildSampleDeckCards(allPrintings) : null;
  const sampleKeyCards = sampleCards ? sampleDeckKeyCards(sampleCards) : null;
  const sampleLegendImage = sampleKeyCards?.legend
    ? (getPreferredFrontImage(
        sampleKeyCards.legend.cardId,
        sampleKeyCards.legend.preferredPrintingId,
      ) ?? null)
    : null;
  const sampleChampionImage = sampleKeyCards?.champion
    ? (getPreferredFrontImage(
        sampleKeyCards.champion.cardId,
        sampleKeyCards.champion.preferredPrintingId,
      ) ?? null)
    : null;

  function handleTrySample() {
    const cards = sampleCards;
    if (!cards) {
      toast.error("The sample deck could not be loaded.");
      return;
    }
    // Without this, the list flashes in before navigation to the new deck completes.
    setCreatingSample(true);
    if (!userId) {
      const store = useLocalDecksStore.getState();
      const localId = store.createDeck(SAMPLE_DECK_FORMAT, SAMPLE_DECK_NAME);
      store.setCards(localId, cards);
      void navigate({ to: "/decks/$deckId", params: { deckId: localId } });
      return;
    }
    createDeck.mutate(
      { name: SAMPLE_DECK_NAME, format: SAMPLE_DECK_FORMAT },
      {
        onSuccess: (data) => {
          const deck = data as DeckResponse;
          saveDeckCards.mutate(
            { deckId: deck.id, cards },
            {
              onSuccess: () => {
                void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
              },
              // Error is reported by the global mutation error toast (reportMutationError).
              onError: () => {
                setCreatingSample(false);
              },
            },
          );
        },
        // Error is reported by the global mutation error toast (reportMutationError).
        onError: () => {
          setCreatingSample(false);
        },
      },
    );
  }
  // -1px: the title bar tucks 1px under the header via PAGE_TOP_BAR_STICKY.
  const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
  const titleHeight = useMeasuredHeight(titleSlot);
  const toolbarOffset = useHeaderHeight() + titleHeight - 1;

  const {
    search,
    formats,
    formatsExclude,
    validity,
    drafts,
    domains,
    domainsExclude,
    folders,
    foldersExclude,
    showArchived,
  } = useDeckListFilters();
  const { sortField, sortDir, groupBy, groupDir } = useDeckListViewPrefs();
  const density = useDeckListPrefsStore((state) => state.density);
  const { labels: formatLabels } = useDeckFormatList();
  // Folders are server-side and per-user: a signed-out list has none.
  const { data: deckFolders } = useDeckFolders();
  const folderList = userId ? (deckFolders ?? []) : [];
  const folderLabels = Object.fromEntries(folderList.map((folder) => [folder.id, folder.name]));

  const enriched = useEnrichedItems(deckItems);
  // Availability is computed pre-filter so a chip group doesn't disappear
  // just because the user filtered everything out.
  const availableDomains = availableDomainsFrom(enriched);
  const availability = filterAvailabilityFrom(enriched);
  const visible = partitionByArchived(enriched, showArchived);
  const activeFilters = {
    search,
    formats,
    formatsExclude,
    validity,
    drafts,
    domains,
    domainsExclude,
    folders,
    foldersExclude,
  };
  const filtered = filterDecks(visible, activeFilters);
  const counts = filterCountsFrom(visible, activeFilters);
  const sorted = sortDecks(filtered, sortField, sortDir);
  const groups = groupDecks(sorted, groupBy, groupDir, {
    domains: labels.domains,
    formats: formatLabels,
    folders: folderLabels,
  });

  const containerClass =
    density === "grid"
      ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : "flex flex-col gap-1.5";

  const [expandedFamilies, setExpandedFamilies] = useState<ReadonlySet<string>>(new Set());
  const toggleFamily = (familyId: string) => {
    setExpandedFamilies((previous) => {
      const next = new Set(previous);
      if (!next.delete(familyId)) {
        next.add(familyId);
      }
      return next;
    });
  };

  const renderEntry = (entry: CollapsedDeckEntry<DeckListItemWithNames>) =>
    density === "grid" ? (
      <DeckTile
        key={entry.item.deck.id}
        item={entry.item}
        folderLabels={folderLabels}
        family={entry.family}
        onToggleFamily={toggleFamily}
      />
    ) : (
      <DeckListRow
        key={entry.item.deck.id}
        item={entry.item}
        folderLabels={folderLabels}
        family={entry.family}
        onToggleFamily={toggleFamily}
      />
    );

  return (
    <div className={`${PAGE_WIDTH.full} ${PAGE_PADDING_NO_TOP}`}>
      {/* mx-safe-neg, not -mx-3: must cancel the same px-safe amount as the gutter. */}
      <div ref={setTitleSlot} className={cn(PAGE_TOP_BAR_STICKY, "mx-safe-neg")}>
        <PageTopBar>
          <PageTopBarTitle>Decks</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarIconButton
              aria-label="Deck building help"
              render={<Link to="/help/$slug" params={{ slug: "deck-building" }} />}
            >
              <CircleHelpIcon className="size-4" />
            </PageTopBarIconButton>
            <PageTopBarButton render={<Link to="/decks/import" />}>
              <UploadIcon className="size-4" />
              Import
            </PageTopBarButton>
            <PageTopBarPrimaryButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New Deck
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </div>

      {!userId && localItems.length > 0 && <LocalDeckSaveBanner />}

      {deckItems.length === 0 || creatingSample ? (
        <EmptyState
          className="py-16"
          icon={SwordsIcon}
          title="No decks yet"
          description={
            <>
              Build against the official rules or fully freeform, validated live against your
              collection, with prices for anything you&apos;re missing.{" "}
              <Link to="/help/$slug" params={{ slug: "deck-building" }}>
                Learn how deck building works.
              </Link>
            </>
          }
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              Create your first deck
            </Button>
            <Link to="/decks/import" className={buttonVariants({ variant: "ghost" })}>
              <UploadIcon />
              Import a deck
            </Link>
          </div>
          {sampleCards && sampleLegendImage && (
            <Pressable
              onClick={handleTrySample}
              disabled={creatingSample}
              className="mt-6 block w-full max-w-xs disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="text-muted-foreground mb-2 block text-center text-sm">
                or explore the builder with a ready-made deck:
              </span>
              <Card className={cn(cardLinkVariants(), "gap-0 py-0")}>
                <FannedPreview
                  legendImage={sampleLegendImage}
                  championImage={sampleChampionImage}
                />
                <span className="flex items-center justify-between gap-3 p-3">
                  <span className="flex flex-col">
                    <span className="font-medium">{SAMPLE_DECK_NAME}</span>
                    <span className="text-muted-foreground text-xs">
                      {creatingSample
                        ? "Opening the builder…"
                        : "Ready to play, opens right in the builder"}
                    </span>
                  </span>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                </span>
              </Card>
            </Pressable>
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          <div
            // No pt: the title bar's pb-3 already provides the gap. z-30 keeps this
            // co-planar with the title bar so the search input's focus ring isn't clipped.
            className="bg-background/80 mx-safe-neg px-safe sticky z-30 pb-3 backdrop-blur-lg sm:rounded-b-lg"
            style={{ top: toolbarOffset }}
          >
            <DeckListToolbar
              availableDomains={availableDomains}
              availability={availability}
              counts={counts}
              folders={folderList}
              totalCount={visible.length}
              filteredCount={filtered.length}
            />
          </div>

          {sorted.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyDescription>No decks match your filters.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2 pt-3">
              {groups.map((group) => {
                const entries = collapseFamilies(group.items, expandedFamilies);
                return (
                  <div key={group.key}>
                    <GroupHeader label={group.label} count={group.items.length} />
                    <div className={containerClass}>
                      {entries.map((entry) => renderEntry(entry))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <CreateDeckDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ClaimLocalDecksPrompt />
    </div>
  );
}
