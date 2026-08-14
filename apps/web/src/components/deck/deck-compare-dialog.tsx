import type { Card, Printing } from "@openrift/shared";
import { ZONE_LABELS } from "@openrift/shared";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, SwordsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CommandEmpty } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldSeparator } from "@/components/ui/field";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { useDeckCards } from "@/hooks/use-deck-builder";
import {
  deckDetailQueryOptions,
  decksQueryOptions,
  publicDeckQueryOptions,
} from "@/hooks/use-decks";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { useSession, useUserId } from "@/lib/auth-session";
import type { CompareDeckOption, OwnDeckCard } from "@/lib/deck-compare-sources";
import { collectCompareDeckOptions, ownDeckDiffCards } from "@/lib/deck-compare-sources";
import type { DeckDiff, DeckDiffCard, DeckDiffEntry } from "@/lib/deck-diff";
import { diffDecks } from "@/lib/deck-diff";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportEntry } from "@/lib/deck-import-parsers";
import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "@/lib/deck-import-parsers";
import { cn } from "@/lib/utils";
import type { LocalDeck } from "@/stores/local-decks-store";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

interface DeckCompareDialogProps {
  deckId: string;
  deckName: string;
  /** The deck's home collection, whose copies count as buildable for it. */
  homeCollectionId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompareResult {
  /** What the diff was taken against, for the summary line. */
  sourceLabel: string;
  diff: DeckDiff;
  /**
   * What resolved to no catalog card: the raw text of a pasted line, or the
   * card id of a row in a picked deck whose card has left the catalog.
   */
  unmatched: string[];
}

/** Either the parsed entries, or the message to show instead. */
type EntriesResult = { entries: DeckImportEntry[] } | { error: string };

/** Either the picked deck's rows, or the message to show instead. */
type OwnDeckResult = { cards: readonly OwnDeckCard[] } | { error: string };

/** The label used for a pasted list, so both sources read the same way. */
const PASTED_SOURCE_LABEL = "the pasted list";

/** `pendingSource` stand-in for the text box, which has no deck id of its own. */
const PASTE_SOURCE = "paste";

/**
 * Reads a deck the user already owns. A `local:` id resolves straight from the
 * browser store; a server id goes through the deck-detail query, so re-picking
 * a deck in the same session is served from cache.
 *
 * @returns The deck's card rows, or the message to show instead.
 */
async function loadOwnDeckCards(
  queryClient: QueryClient,
  userId: string | null,
  deckId: string,
  localDecks: Record<string, LocalDeck>,
): Promise<OwnDeckResult> {
  if (isLocalDeckId(deckId)) {
    const deck = localDecks[deckId];
    if (!deck) {
      return { error: "That deck is no longer stored in this browser." };
    }
    return { cards: deck.cards };
  }
  if (!userId) {
    return { error: "Sign in to compare against your saved decks." };
  }
  try {
    const data = await queryClient.fetchQuery(deckDetailQueryOptions(userId, deckId));
    return { cards: data.cards };
  } catch {
    return { error: "Couldn't load that deck. It may have been deleted." };
  }
}

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

/** @returns The text to show for a line that matched no catalog card. */
function unmatchedLabel(entry: DeckImportEntry): string {
  return entry.cardName ?? entry.shortCode ?? "";
}

/**
 * Matches parsed entries against the catalog and diffs the result against the
 * open deck.
 * @returns The diff plus the lines that resolved to nothing.
 */
function compareEntries(
  ours: readonly DeckDiffCard[],
  entries: DeckImportEntry[],
  allPrintings: Printing[],
): CompareResult {
  const matched = matchDeckEntries(entries, allPrintings);
  const theirs: DeckDiffCard[] = [];
  const unmatched: string[] = [];
  for (const match of matched) {
    if (!match.resolvedCard) {
      const label = unmatchedLabel(match.entry);
      if (label.length > 0) {
        unmatched.push(label);
      }
      continue;
    }
    theirs.push({
      cardId: match.resolvedCard.cardId,
      cardName: match.resolvedCard.cardName,
      zone: match.zone,
      quantity: match.entry.quantity,
    });
  }
  return { sourceLabel: PASTED_SOURCE_LABEL, diff: diffDecks(ours, theirs), unmatched };
}

/**
 * Diffs the open deck against another deck of the user's own. Its rows already
 * carry catalog ids, so this skips the text parser and its name matcher; only a
 * card that has since left the catalog can fail to resolve.
 *
 * @returns The diff plus the card ids that resolved to nothing.
 */
function compareOwnDeck(
  ours: readonly DeckDiffCard[],
  cards: readonly OwnDeckCard[],
  cardsById: Record<string, Card>,
  sourceLabel: string,
): CompareResult {
  const { theirs, unmatched } = ownDeckDiffCards(cards, cardsById);
  return { sourceLabel, diff: diffDecks(ours, theirs), unmatched };
}

/** @returns Copies of `cardId` available for deck building, across all its printings. */
function ownedCopiesOf(
  cardId: string,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
  available: Record<string, number>,
): number {
  let total = 0;
  for (const printing of printingsByCardId.get(cardId) ?? []) {
    total += available[printing.id] ?? 0;
  }
  return total;
}

/** @returns How many copies this entry asks the user to find, 0 when it takes none. */
function copiesNeeded(entry: DeckDiffEntry): number {
  return Math.max(0, entry.theirs - entry.ours);
}

const CHIP_BASE = "rounded px-1.5 font-mono text-xs font-bold tabular-nums";

const CHIP_STYLES: Record<DeckDiffEntry["kind"], string> = {
  add: "bg-green-500/10 text-green-600 dark:text-green-500",
  cut: "bg-destructive/10 text-destructive",
  change: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
};

/** @returns The chip text, e.g. "+2", "−1", or "3→2". */
function chipLabel(entry: DeckDiffEntry): string {
  if (entry.kind === "add") {
    return `+${entry.theirs}`;
  }
  if (entry.kind === "cut") {
    return `−${entry.ours}`;
  }
  return `${entry.ours}→${entry.theirs}`;
}

function DiffRow({ entry, owned }: { entry: DeckDiffEntry; owned: number | null }) {
  const needed = copiesNeeded(entry);
  const showOwned = owned !== null && needed > 0 && owned < needed;
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn(CHIP_BASE, CHIP_STYLES[entry.kind])}>{chipLabel(entry)}</span>
      <span className="min-w-0 flex-1 truncate">{entry.cardName}</span>
      {showOwned && (
        <span
          className="font-mono text-xs text-amber-700 tabular-nums dark:text-amber-500"
          title={`You own ${owned} of the ${needed} copies you'd add`}
        >
          {owned}/{needed}
        </span>
      )}
    </div>
  );
}

export function DeckCompareDialog({
  deckId,
  deckName,
  homeCollectionId,
  open,
  onOpenChange,
}: DeckCompareDialogProps) {
  const queryClient = useQueryClient();
  const { allPrintings, printingsByCardId, cardsById } = useCards();
  const ourCards = useDeckCards(deckId);
  const { data: session } = useSession();
  // Auth-optional (ADR-035): a logged-out visitor still has browser-local decks
  // to compare against, so the server list is fetched only when signed in — and
  // only once the dialog opens, since nothing else here needs it.
  const userId = useUserId();
  const serverDecksQuery = useQuery({
    ...decksQueryOptions(userId ?? ""),
    enabled: Boolean(userId) && open,
  });
  const localDecks = useLocalDecksStore((state) => state.decks);
  const deckOptions = collectCompareDeckOptions(deckId, serverDecksQuery.data, localDecks);
  // Same source as the card browser's owned badge: copies in collections
  // excluded from deck building don't count as buildable, except the ones in
  // this deck's own home collection.
  const { data: deckCounts } = useDeckBuildingCounts(Boolean(session?.user), homeCollectionId);
  const available = deckCounts?.available ?? null;

  const [text, setText] = useState("");
  // The source being resolved: a deck's id, or PASTE_SOURCE for the text box.
  // One state rather than a boolean, so the picked row can show its own spinner.
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }
    setText("");
    setPendingSource(null);
    setHighlightedId("");
    setError(null);
    setResult(null);
  }, [open]);

  const handleCompare = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    setPendingSource(PASTE_SOURCE);
    setError(null);
    const entriesResult = await resolveCompareEntries(queryClient, trimmed);
    setPendingSource(null);
    if ("error" in entriesResult) {
      setError(entriesResult.error);
      return;
    }
    setResult(compareEntries(ourCards, entriesResult.entries, allPrintings));
  };

  const handlePickDeck = async (option: CompareDeckOption) => {
    setPendingSource(option.id);
    setError(null);
    const loaded = await loadOwnDeckCards(queryClient, userId, option.id, localDecks);
    setPendingSource(null);
    if ("error" in loaded) {
      setError(loaded.error);
      return;
    }
    setResult(compareOwnDeck(ourCards, loaded.cards, cardsById, option.name));
  };

  const handleCompareAnother = () => {
    setResult(null);
    setError(null);
  };

  const diff = result?.diff;
  const isIdentical = diff !== undefined && diff.zones.length === 0;
  const pending = pendingSource !== null;
  const hasDeckOptions = deckOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compare deck</DialogTitle>
          {!result && (
            <DialogDescription>
              {hasDeckOptions
                ? `Pick one of your decks, or paste another, to see how it differs from ${deckName}.`
                : `Paste another deck to see how it differs from ${deckName}.`}
            </DialogDescription>
          )}
        </DialogHeader>

        {result ? (
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-muted-foreground text-sm tabular-nums">
              {/* Matching decks skip the +0 · −0 tail — the match line below
                  already says it, and zero deltas read like an error. */}
              Compared with {result.sourceLabel} · {diff?.sharedCount} cards shared
              {isIdentical ? "" : ` · +${diff?.addCount} · −${diff?.cutCount}`}
            </p>

            {isIdentical ? (
              <p className="text-sm">The decks match, card for card.</p>
            ) : (
              <div className="flex max-h-[50dvh] min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain">
                {diff?.zones.map((zoneDiff) => (
                  <section key={zoneDiff.zone} className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
                      {ZONE_LABELS[zoneDiff.zone]}
                    </span>
                    {zoneDiff.entries.map((entry) => (
                      <DiffRow
                        key={entry.cardId}
                        entry={entry}
                        owned={
                          available
                            ? ownedCopiesOf(entry.cardId, printingsByCardId, available)
                            : null
                        }
                      />
                    ))}
                  </section>
                ))}
              </div>
            )}

            {result.unmatched.length > 0 && (
              <div className="text-muted-foreground flex flex-col gap-1">
                <p className="text-sm">
                  Couldn&apos;t match {result.unmatched.length}{" "}
                  {result.unmatched.length === 1 ? "line" : "lines"}
                </p>
                <ul className="text-2xs flex flex-col gap-0.5">
                  {result.unmatched.map((line, index) => (
                    // Duplicate raw lines are possible, so the index is part of the key.
                    <li key={`${line}-${index}`} className="truncate">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-2xs">
                Shows what would turn this deck into {result.sourceLabel}. Nothing is changed
                automatically.
              </p>
              <Button variant="ghost" onClick={handleCompareAnother}>
                Compare another
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            {hasDeckOptions && (
              <>
                {/* No overflow wrapper — CommandList scrolls internally, which
                    keeps the filter input pinned above the rows. */}
                <div>
                  <PickerList
                    searchPlaceholder="Filter your decks…"
                    highlightedId={highlightedId}
                    onHighlightChange={setHighlightedId}
                  >
                    <CommandEmpty>No matching decks.</CommandEmpty>
                    {deckOptions.map((option) => (
                      <PickerRow
                        key={option.id}
                        value={option.id}
                        keywords={[option.name]}
                        onSelect={() => void handlePickDeck(option)}
                        className="px-3 py-2"
                      >
                        {pendingSource === option.id ? (
                          <Loader2Icon className="size-4 shrink-0 animate-spin" />
                        ) : (
                          <SwordsIcon className="size-4 shrink-0" />
                        )}
                        <span className="truncate">{option.name}</span>
                        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                          {option.cardCount}
                        </span>
                      </PickerRow>
                    ))}
                  </PickerList>
                </div>
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-popover">
                  or
                </FieldSeparator>
              </>
            )}
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste a deck code, share link, or card list…"
              className="field-sizing-fixed text-sm"
              rows={hasDeckOptions ? 4 : 8}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button
              className="self-end"
              onClick={handleCompare}
              disabled={pending || text.trim().length === 0}
            >
              {pendingSource === PASTE_SOURCE ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Comparing…
                </>
              ) : (
                "Compare"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
