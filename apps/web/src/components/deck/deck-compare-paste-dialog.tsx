import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { publicDeckQueryOptions } from "@/hooks/use-decks";
import { diffCardsFromEntries } from "@/lib/deck-compare-sources";
import type { DeckDiffCard } from "@/lib/deck-diff";
import type { DeckImportEntry } from "@/lib/deck-import-parsers";
import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "@/lib/deck-import-parsers";

/** A list pasted into the comparison, held for the session rather than saved. */
export interface PastedCompareSource {
  cards: DeckDiffCard[];
  /** Lines that matched no catalog card, so the page can own up to them. */
  unmatched: string[];
  /**
   * Exactly what was pasted, kept so the page can hand it to /decks/import if
   * the comparison turns out to be worth keeping. Not re-serialised from
   * `cards`: the import flow reads every format this dialog does, and the raw
   * text carries whatever the parse here dropped.
   */
  text: string;
}

/** Either the parsed entries, or the message to show instead. */
type EntriesResult = { entries: DeckImportEntry[] } | { error: string };

/**
 * Loads a shared deck by token, mirroring what /decks/import does with a
 * pasted OpenRift share link.
 * @returns The shared deck's cards as import entries, or the failure message.
 */
async function entriesFromShareToken(
  queryClient: QueryClient,
  token: string,
): Promise<EntriesResult> {
  try {
    const data = await queryClient.fetchQuery(publicDeckQueryOptions(token));
    if (data.cards.length === 0) {
      return { error: "That shared deck has no cards to compare against." };
    }
    return { entries: entriesFromSharedDeck(data.cards) };
  } catch {
    return { error: "Couldn't load that shared deck. The link may have been unshared or rotated." };
  }
}

/**
 * Turns pasted text into import entries. A URL resolves through the share API
 * or yields the deck code embedded in it; anything else is sniffed and parsed
 * by the same codecs the import page uses.
 * @returns The parsed entries, or the message to show instead.
 */
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

/**
 * Reads a deck code, share link or card list into one side of the comparison.
 * The result is handed back to the page and kept there for the session, never
 * in the URL or the deck list: a pasted list is something to look at first.
 * Keeping it is the page's Save button, which hands the raw text to
 * /decks/import rather than saving anything from here.
 *
 * @returns The dialog.
 */
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

  useEffect(() => {
    if (open) {
      return;
    }
    setText("");
    setPending(false);
    setError(null);
  }, [open]);

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
