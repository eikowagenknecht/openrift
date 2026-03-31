import type { DeckCardResponse, DeckResponse, Domain } from "@openrift/shared";
import { COLORLESS_DOMAIN, validateDeck } from "@openrift/shared";
import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, CircleAlert, Copy, MoreHorizontal, Plus, Swords, Trash2 } from "lucide-react";
import { useState } from "react";

import { ImportDeckButton } from "@/components/deck/import-deck-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deckDetailQueryOptions,
  useCloneDeck,
  useCreateDeck,
  useDecks,
  useDeleteDeck,
} from "@/hooks/use-decks";
import { getDomainGradientStyle } from "@/lib/domain";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard",
  freeform: "Freeform",
};

function DomainDot({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  const ext = domain === COLORLESS_DOMAIN ? "svg" : "webp";
  return (
    <img src={`/images/domains/${lower}.${ext}`} alt={domain} title={domain} className="size-4" />
  );
}

function DeckSummary({ cards, format }: { cards: DeckCardResponse[]; format: string }) {
  const legend = cards.find((card) => card.zone === "legend");
  const domains = legend?.domains ?? [];
  const totalCards = cards
    .filter((card) => card.zone !== "overflow")
    .reduce((sum, card) => sum + card.quantity, 0);

  const violations = validateDeck({
    format: format as "standard" | "freeform",
    cards: cards.map((card) => ({
      cardId: card.cardId,
      zone: card.zone,
      quantity: card.quantity,
      cardName: card.cardName,
      cardType: card.cardType,
      superTypes: card.superTypes,
      domains: card.domains,
      tags: card.tags,
    })),
  });

  const isValid = violations.length === 0;

  return (
    <div className="flex items-center gap-3">
      {domains.length > 0 && (
        <span className="flex items-center gap-0.5">
          {domains.map((domain) => (
            <DomainDot key={domain} domain={domain} />
          ))}
        </span>
      )}
      <span className="text-muted-foreground text-xs">{totalCards} cards</span>
      {format === "standard" &&
        (isValid ? (
          <Check className="size-3.5 text-green-600 dark:text-green-400" />
        ) : (
          <CircleAlert className="text-muted-foreground/50 size-3.5" />
        ))}
    </div>
  );
}

function DeckRow({ deck, cards }: { deck: DeckResponse; cards?: DeckCardResponse[] }) {
  const navigate = useNavigate();
  const cloneDeck = useCloneDeck();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteDeck = useDeleteDeck();

  const handleClone = () => {
    cloneDeck.mutate(deck.id, {
      onSuccess: (data) => {
        const newDeck = data as DeckResponse;
        void navigate({ to: "/decks/$deckId", params: { deckId: newDeck.id } });
      },
    });
  };

  const handleDelete = () => {
    deleteDeck.mutate(deck.id);
    setDeleteOpen(false);
  };

  const updatedDate = new Date(deck.updatedAt).toLocaleDateString();
  const legend = cards?.find((card) => card.zone === "legend");
  const legendDomains = legend?.domains as Domain[] | undefined;
  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "18")
      : undefined;

  return (
    <>
      <div
        className="hover:bg-muted/30 flex items-center gap-4 rounded-lg border p-4 transition-colors"
        style={gradientStyle}
      >
        <Link
          to="/decks/$deckId"
          params={{ deckId: deck.id }}
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          <Swords className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{deck.name}</span>
              <Badge variant="outline" className="shrink-0 text-xs capitalize">
                {deck.format}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-muted-foreground text-xs">Updated {updatedDate}</span>
              {cards && <DeckSummary cards={cards} format={deck.format} />}
            </div>
          </div>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleClone}>
              <Copy className="size-4" />
              Clone
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deck.name}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
  const [format, setFormat] = useState<"standard" | "freeform">("standard");

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
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="freeform">Freeform</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

export function DeckListPage() {
  const { data: decks } = useDecks();
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch details for all decks to show domains, card counts, and validity
  const detailQueries = useQueries({
    queries: decks.map((deck) => deckDetailQueryOptions(deck.id)),
  });
  const cardsByDeckId = new Map<string, DeckCardResponse[]>();
  for (const query of detailQueries) {
    if (query.data) {
      cardsByDeckId.set(query.data.deck.id, query.data.cards);
    }
  }

  return (
    <div className={`${CONTAINER_WIDTH} ${PAGE_PADDING}`}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Decks</h1>
        <div className="flex items-center gap-2">
          <ImportDeckButton />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New Deck
          </Button>
        </div>
      </div>

      {decks.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center">
          <Swords className="size-10 opacity-50" />
          <p>No decks yet</p>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            Create your first deck
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {decks.map((deck) => (
            <DeckRow key={deck.id} deck={deck} cards={cardsByDeckId.get(deck.id)} />
          ))}
        </div>
      )}

      <CreateDeckDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
