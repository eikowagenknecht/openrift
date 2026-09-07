import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/features/cards/hooks/use-cards";
import { publicDeckQueryOptions } from "@/features/decks/hooks/use-decks";
import { diffCardsFromEntries } from "@/features/decks/lib/deck-compare-sources";
import type { DeckDiffCard } from "@/features/decks/lib/deck-diff";
import type { DeckImportEntry } from "@/features/decks/lib/deck-import-parsers";
import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "@/features/decks/lib/deck-import-parsers";

/** A list pasted into the comparison, held only for the session; not persisted. */
export interface PastedCompareSource {
  cards: DeckDiffCard[];
  unmatched: string[];
  text: string;
}

/** Either the parsed entries, or the message to show instead. */
type EntriesResult = { entries: DeckImportEntry[] } | { error: string };

/** Mirrors what /decks/import does with a pasted OpenRift share link. */
async function entriesFromShareToken(
  queryClient: QueryClient,
  token: string,
): Promise<EntriesResult> {
  try {
    const data = await queryClient.query(publicDeckQueryOptions(token));
    if (data.cards.length === 0) {
      return { error: "That shared deck has no cards to compare against." };
    }
    return { entries: entriesFromSharedDeck(data.cards) };
  } catch {
    return { error: "Couldn't load that shared deck. The link may have been unshared or rotated." };
  }
}

/** A URL resolves through the share API or yields the deck code embedded in it; anything else is sniffed and parsed by the same codecs the import page uses. */
async function resolveCompareEntries(
  queryClient: QueryClient,
  text: string,
): Promise<EntriesResult> {
  const urlSniff = extractDeckFromUrl(text);
  if (urlSniff?.kind === "share-token") {
    return await entriesFromShareToken(queryClient, urlSniff.token);
  }
  if (urlSniff?.kind === "url-no-deck") {
    return { error: "Couldn't find a deck code or share link in that URL." };
  }
  const source = urlSniff?.kind === "deck-code" ? urlSniff.code : text;
  const format = urlSniff?.kind === "deck-code" ? "piltover" : sniffDeckImportFormat(source);
  const { entries } = parseDeckImportData(source, format);
  if (entries.length === 0) {
    return { error: "Couldn't read a deck out of that. Paste a deck code, share link, or list." };
  }
  return { entries };
}

export function DeckComparePasteDialog({
  open,
  onOpenChange,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: (source: PastedCompareSource) => void;
}) {
  const queryClient = useQueryClient();
  const { allPrintings } = useCards();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seededOpen, setSeededOpen] = useState(open);
  if (seededOpen !== open) {
    setSeededOpen(open);
    if (!open) {
      setText("");
      setPending(false);
      setError(null);
    }
  }

  const handleCompare = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    setPending(true);
    setError(null);
    const entriesResult = await resolveCompareEntries(queryClient, trimmed);
    setPending(false);
    if ("error" in entriesResult) {
      setError(entriesResult.error);
      return;
    }
    const resolved = diffCardsFromEntries(entriesResult.entries, allPrintings);
    if (resolved.cards.length === 0) {
      setError("None of those lines matched a card in the catalog.");
      return;
    }
    onResolved({ ...resolved, text: trimmed });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste a deck</DialogTitle>
          <DialogDescription>A deck code, share link, or plain card list.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste a deck code, share link, or card list…"
          className="field-sizing-fixed text-sm"
          rows={8}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button
          className="self-end"
          onClick={() => void handleCompare()}
          disabled={pending || text.trim().length === 0}
        >
          {pending ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Reading…
            </>
          ) : (
            "Use this list"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
