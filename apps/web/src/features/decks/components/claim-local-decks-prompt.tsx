import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { useCreateDeck, useSaveDeckCards, useUpdateDeck } from "@/features/decks/hooks/use-decks";
import { decksKeys } from "@/features/decks/lib/decks-query-keys";
import { useLocalDecksStore } from "@/features/decks/stores/local-decks-store";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";

export function ClaimLocalDecksPrompt() {
  const userId = useUserId();
  const hydrated = useHydrated();
  const decks = useLocalDecksStore((state) => state.decks);
  const clearImported = useLocalDecksStore((state) => state.clearImported);
  const createDeck = useCreateDeck();
  const saveDeckCards = useSaveDeckCards();
  const updateDeck = useUpdateDeck();
  const queryClient = useQueryClient();
  const { labels: formatLabels } = useDeckFormatList();
  const [dismissed, setDismissed] = useState(false);
  const [deselected, setDeselected] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);

  const list = Object.values(decks);
  const open = hydrated && Boolean(userId) && list.length > 0 && !dismissed;
  if (!open) {
    return null;
  }

  const isSelected = (id: string) => !deselected[id];
  const selectedDecks = list.filter((deck) => isSelected(deck.id));

  const handleImport = async () => {
    if (selectedDecks.length === 0) {
      return;
    }
    setImporting(true);
    const importedIds: string[] = [];
    for (const deck of selectedDecks) {
      const description = deck.description || undefined;
      try {
        const created = await createDeck.mutateAsync({
          name: deck.name,
          description,
          format: deck.format,
        });
        await saveDeckCards.mutateAsync({ deckId: created.id, cards: deck.cards });
        // `create` can't set formatConfig (e.g. Custom-Region tags); patch it afterward.
        if (deck.formatConfig) {
          await updateDeck.mutateAsync({ deckId: created.id, formatConfig: deck.formatConfig });
        }
        importedIds.push(deck.id);
      } catch {
        // Second toast beside the global mutation error one: this loop claims several decks, only this toast names which one failed.
        toast.error(`Couldn't import "${deck.name}".`);
      }
    }
    // Refresh the server list before dropping the imported locals, or a freshly imported deck can appear twice in the merged list.
    if (userId) {
      await queryClient.invalidateQueries({ queryKey: decksKeys.all(userId) });
    }
    clearImported(importedIds);
    setImporting(false);
    if (importedIds.length > 0) {
      toast.success(
        `Imported ${importedIds.length} ${importedIds.length === 1 ? "deck" : "decks"} to your account.`,
      );
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && setDismissed(true)}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleImport()}>
          <DialogHeader>
            <DialogTitle>Keep your local decks?</DialogTitle>
            <DialogDescription>
              Built on this device while signed out. Unpicked decks stay on this device.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {list.map((deck) => {
              const totalCards = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
              return (
                <li key={deck.id}>
                  <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md p-2">
                    <Checkbox
                      checked={isSelected(deck.id)}
                      onCheckedChange={(checked) =>
                        setDeselected((prev) => ({ ...prev, [deck.id]: !checked }))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{deck.name}</span>
                    <Badge variant="secondary">{formatLabels[deck.format] ?? deck.format}</Badge>
                    <span className="text-muted-foreground tabular-nums">
                      {totalCards} {totalCards === 1 ? "card" : "cards"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDismissed(true)} disabled={importing}>
              Not now
            </Button>
            <Button type="submit" disabled={importing || selectedDecks.length === 0}>
              {importing ? "Importing…" : `Import ${selectedDecks.length} to account`}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
