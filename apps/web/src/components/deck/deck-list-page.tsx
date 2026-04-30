import type { DeckListItemResponse, DeckResponse } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleHelpIcon, DownloadIcon, PlusIcon, SwordsIcon } from "lucide-react";
import { useState } from "react";

import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDeck, useDecks } from "@/hooks/use-decks";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckListItemWithNames } from "@/lib/deck-list-utils";
import {
  availableDomainsFrom,
  enrichItem,
  filterAvailabilityFrom,
  filterDecks,
  groupDecks,
  partitionByArchived,
  sortDecks,
} from "@/lib/deck-list-utils";
import { cn, CONTAINER_WIDTH, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import { useDeckListPrefsStore } from "@/stores/deck-list-prefs-store";

import { DeckListRow } from "./deck-list-row";
import { DeckListToolbar } from "./deck-list-toolbar";
import { DeckTile } from "./deck-tile";

const FORMAT_LABELS: Record<string, string> = {
  constructed: "Constructed",
  freeform: "Freeform",
};

function CreateDeckDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createDeck = useCreateDeck();
  const [name, setName] = useState("New Deck");
  const [format, setFormat] = useState<"constructed" | "freeform">("constructed");

  const handleCreate = () => {
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
            <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
              <SelectTrigger id="deck-format">
                <SelectValue>{(value: string) => FORMAT_LABELS[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="constructed">Constructed</SelectItem>
                <SelectItem value="freeform">Freeform</SelectItem>
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
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={!name.trim() || createDeck.isPending}>
            Create
          </Button>
        </DialogFooter>
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
    return enrichItem(item, {
      legendName: legendCard?.name ?? null,
      championName: championCard?.name ?? null,
      legendDomains: legendCard?.domains ?? null,
    });
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
  const { data: deckItems } = useDecks();
  const [createOpen, setCreateOpen] = useState(false);

  const search = useDeckListPrefsStore((state) => state.search);
  const sortField = useDeckListPrefsStore((state) => state.sortField);
  const sortDir = useDeckListPrefsStore((state) => state.sortDir);
  const density = useDeckListPrefsStore((state) => state.density);
  const groupBy = useDeckListPrefsStore((state) => state.groupBy);
  const groupDir = useDeckListPrefsStore((state) => state.groupDir);
  const formatFilter = useDeckListPrefsStore((state) => state.formatFilter);
  const validityFilter = useDeckListPrefsStore((state) => state.validityFilter);
  const domainFilter = useDeckListPrefsStore((state) => state.domainFilter);
  const showArchived = useDeckListPrefsStore((state) => state.showArchived);

  const enriched = useEnrichedItems(deckItems);
  // Compute filter availability against the enriched set (before any filter is applied)
  // so a chip group doesn't disappear just because the user filtered everything out.
  const availableDomains = availableDomainsFrom(deckItems);
  const availability = filterAvailabilityFrom(enriched);
  const visible = partitionByArchived(enriched, showArchived);
  const filtered = filterDecks(visible, {
    search,
    format: formatFilter,
    validity: validityFilter,
    domains: domainFilter,
  });
  const sorted = sortDecks(filtered, sortField, sortDir);
  const groups = groupDecks(sorted, groupBy, groupDir);

  const containerClass =
    density === "grid"
      ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : "flex flex-col gap-1.5";

  const renderItem = (item: DeckListItemWithNames) =>
    density === "grid" ? (
      <DeckTile key={item.deck.id} item={item} />
    ) : (
      <DeckListRow key={item.deck.id} item={item} />
    );

  return (
    <div className={`${CONTAINER_WIDTH} ${PAGE_PADDING_NO_TOP}`}>
      <div className={cn(PAGE_TOP_BAR_STICKY, "-mx-3 mb-3")}>
        <PageTopBar>
          <PageTopBarTitle>Decks</PageTopBarTitle>
          <PageTopBarActions>
            <Link
              to="/help/$slug"
              params={{ slug: "deck-building" }}
              aria-label="Deck building help"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <CircleHelpIcon className="size-4" />
            </Link>
            <Link to="/decks/import" className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon className="size-4" />
              Import
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New Deck
            </Button>
          </PageTopBarActions>
        </PageTopBar>
      </div>

      {deckItems.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
          <SwordsIcon className="size-10 opacity-50" />
          <p>No decks yet</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              Create your first deck
            </Button>
            <Link to="/decks/import" className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon className="size-4" />
              Import a deck
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <DeckListToolbar
            availableDomains={availableDomains}
            availability={availability}
            totalCount={visible.length}
            filteredCount={filtered.length}
          />

          {sorted.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
              <p>No decks match your filters.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((group) => (
                <div key={group.key}>
                  <GroupHeader label={group.label} count={group.items.length} />
                  <div className={containerClass}>{group.items.map(renderItem)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateDeckDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
