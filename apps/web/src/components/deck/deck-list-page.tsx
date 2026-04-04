import type { DeckResponse } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon, SwordsIcon } from "lucide-react";
import { useState } from "react";

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
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

import { DeckTile } from "./deck-tile";

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard",
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
  const { data: deckItems } = useDecks();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className={`${CONTAINER_WIDTH} ${PAGE_PADDING}`}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Decks</h1>
        <div className="flex items-center gap-2">
          <Link to="/decks/import" className={buttonVariants({ variant: "outline" })}>
            <DownloadIcon className="size-4" />
            Import
          </Link>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New Deck
          </Button>
        </div>
      </div>

      {deckItems.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center">
          <SwordsIcon className="size-10 opacity-50" />
          <p>No decks yet</p>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            Create your first deck
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deckItems.map((item) => (
            <DeckTile key={item.deck.id} item={item} />
          ))}
        </div>
      )}

      <CreateDeckDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
