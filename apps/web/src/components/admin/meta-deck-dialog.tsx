import type { AdminMetaDeck, Card, DeckZone, MetaListStatus } from "@openrift/shared";
import { META_LIST_STATUSES } from "@openrift/shared";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateMetaDeck, useUpdateMetaDeck } from "@/hooks/use-admin-meta";
import { useCards } from "@/hooks/use-cards";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";
import { useDeckFormatList, useZoneOrder } from "@/hooks/use-enums";
import type { MetaDeckDraft } from "@/lib/admin-meta-draft";
import {
  FINISH_TIER_PRESETS,
  metaDeckArchetypeCards,
  metaDeckFinishTier,
  metaDeckToDraft,
  summarizeDeckCards,
  validateMetaDeckDraft,
} from "@/lib/admin-meta-draft";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";
import type { DeckMatchedEntry } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportAuto } from "@/lib/deck-import-parsers";
import { errorText } from "@/lib/error-text";
import { META_LIST_STATUS_LABELS, formatFinishTier } from "@/lib/meta-format";

/**
 * How a pasted line named its card, for the unmatched and review lists.
 * @returns The source's own name or short code.
 */
function sourceLabel(entry: DeckMatchedEntry): string {
  return entry.entry.cardName ?? entry.entry.shortCode ?? "(unnamed line)";
}

/** What one parse produced: the rows to save, plus everything worth reporting. */
interface ParseResult {
  cards: ImportedDeckCard[];
  /** Fuzzy name matches — saved, but worth eyeballing before the save. */
  needsReview: { source: string; matched: string }[];
  /** Lines no card was found for. These are dropped. */
  unresolved: string[];
  warnings: string[];
  detected: string;
}

const DETECTED_LABELS: Record<string, string> = {
  piltover: "deck code",
  text: "text list",
  tts: "TTS string",
};

/**
 * Long-form labels for the status picker. The badges on the public surfaces use
 * the short ones ({@link META_LIST_STATUS_LABELS}); here the choice is being
 * made rather than read back, so `partial` spells out what it promises.
 */
const LIST_STATUS_LABELS: Record<MetaListStatus, string> = {
  full: META_LIST_STATUS_LABELS.full,
  partial: "Partial list (main deck complete)",
  archetype: META_LIST_STATUS_LABELS.archetype,
};

/**
 * One catalog pick for an archetype-only entry. There is no list to paste, so
 * the legend (and the champion, where the source named one) are chosen by name
 * through the same autocomplete the candidate queue's name picker uses.
 *
 * @returns The picker, or the picked card with a clear button.
 */
function ArchetypeCardPicker({
  label,
  hint,
  cardsById,
  cardId,
  onPick,
}: {
  label: string;
  hint: string;
  cardsById: Record<string, Card>;
  cardId: string | null;
  onPick: (cardId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, { wait: 150 });
  const results = useCatalogCardSearch(debouncedSearch);

  const picked = cardId === null ? undefined : cardsById[cardId];

  if (picked) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-center gap-1">
          <span className="truncate font-medium">{picked.name}</span>
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Clear ${label}`}
            onClick={() => onPick(null)}
          >
            <XIcon />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <CardSearchDropdown
        results={results}
        onSearch={setSearch}
        onSelect={onPick}
        placeholder="Search the catalog…"
        className="w-full"
      />
      <p className="text-muted-foreground text-sm">{hint}</p>
    </div>
  );
}

interface MetaDeckDialogProps {
  eventId: string;
  /** The event's own format, used as the default for a new deck. */
  eventFormat: string;
  /** The deck being edited. Omitted when the dialog archives a new one. */
  deck?: AdminMetaDeck;
  onClose: () => void;
}

/**
 * The add / edit form for one archived deck (ADR-014). Cards come from the same
 * paste-and-match pipeline as /decks/import, so a deck code, a text list, or a
 * TTS string all work; the API is sent resolved card rows, never the raw text.
 *
 * @returns The deck dialog.
 */
export function MetaDeckDialog({ eventId, eventFormat, deck, onClose }: MetaDeckDialogProps) {
  const { allPrintings, cardsById } = useCards();
  const { formats, labels: formatLabels } = useDeckFormatList();
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const createDeck = useCreateMetaDeck();
  const updateDeck = useUpdateMetaDeck();

  const [draft, setDraft] = useState<MetaDeckDraft>(() =>
    deck
      ? metaDeckToDraft(deck)
      : {
          name: "",
          format: eventFormat,
          playerName: "",
          finishTier: "1",
          record: "",
          listStatus: "full",
          legendCardId: null,
          championCardId: null,
        },
  );
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [formError, setFormError] = useState("");

  const isPending = createDeck.isPending || updateDeck.isPending;
  // An archetype-only entry replaces the whole paste-and-match flow with two
  // catalog picks: there is no list to parse, only the legend it is filed under.
  const isArchetype = draft.listStatus === "archetype";

  function set<TKey extends keyof MetaDeckDraft>(key: TKey, value: MetaDeckDraft[TKey]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleParse() {
    const text = rawText.trim();
    if (text.length === 0) {
      return;
    }
    const { format: detected, entries, warnings } = parseDeckImportAuto(text);
    const matched = matchDeckEntries(entries, allPrintings);
    const needsReview: { source: string; matched: string }[] = [];
    const unresolved: string[] = [];
    for (const entry of matched) {
      const resolved = entry.resolvedCard;
      if (!resolved) {
        unresolved.push(sourceLabel(entry));
        continue;
      }
      if (entry.status === "needs-review") {
        needsReview.push({ source: sourceLabel(entry), matched: resolved.cardName });
      }
    }
    setFormError("");
    setParsed({
      cards: dedupeMatchedEntries(matched),
      needsReview,
      unresolved,
      warnings,
      detected: DETECTED_LABELS[detected] ?? detected,
    });
  }

  async function handleSubmit() {
    const problem = validateMetaDeckDraft(draft, deck === undefined);
    if (problem) {
      setFormError(problem);
      return;
    }
    const finishTier = metaDeckFinishTier(draft.finishTier);
    if (finishTier === null) {
      setFormError("Finish must be a positive whole number");
      return;
    }
    const record = draft.record.trim() || null;

    // Where the rows come from depends on the status: an archetype has no list
    // to paste, so its legend and champion picks are the whole card payload.
    const cards = isArchetype ? metaDeckArchetypeCards(draft) : (parsed?.cards ?? []);

    // The branch is settled before the try/catch: the React Compiler bails on a
    // conditional inside one.
    let save: () => Promise<unknown>;
    if (deck) {
      save = () =>
        updateDeck.mutateAsync({
          id: deck.deckId,
          eventId,
          name: draft.name.trim(),
          playerName: draft.playerName.trim(),
          finishTier,
          record,
          listStatus: draft.listStatus,
          // Only a fresh parse (or a fresh pick) replaces the stored card list.
          ...(cards.length > 0 ? { cards } : {}),
        });
    } else {
      if (cards.length === 0) {
        setFormError(
          isArchetype
            ? "Pick the legend before saving."
            : "Paste a decklist and parse it before saving.",
        );
        return;
      }
      save = () =>
        createDeck.mutateAsync({
          eventId,
          name: draft.name.trim(),
          format: draft.format.trim(),
          cards,
          playerName: draft.playerName.trim(),
          finishTier,
          record,
          listStatus: draft.listStatus,
        });
    }

    const successMessage = deck
      ? `Updated "${draft.name.trim()}"`
      : `Archived "${draft.name.trim()}"`;
    setFormError("");
    try {
      await save();
      toast.success(successMessage);
      onClose();
    } catch (error) {
      // The global mutation error toast reports it too; this keeps the reason in
      // front of the form so the field can be fixed in place.
      setFormError(errorText(error, "Save failed"));
    }
  }

  const summary = parsed ? summarizeDeckCards(parsed.cards) : null;
  const copiesByZone = new Map<DeckZone, number>();
  for (const card of parsed?.cards ?? []) {
    copiesByZone.set(card.zone, (copiesByZone.get(card.zone) ?? 0) + card.quantity);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{deck ? "Edit archived deck" : "Add deck"}</DialogTitle>
            <DialogDescription>
              {isArchetype
                ? "The source only named the archetype, so pick its legend instead of pasting a list. The entry gets no public page."
                : deck
                  ? "Paste a new list only if the cards changed. Leaving the box empty keeps the stored list."
                  : "Paste a deck code, a text list, or a TTS string. Cards are matched against the catalog before saving."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meta-deck-name">Deck name</Label>
              <Input
                id="meta-deck-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Yasuo Aggro"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-deck-player">Player</Label>
              <Input
                id="meta-deck-player"
                value={draft.playerName}
                onChange={(e) => set("playerName", e.target.value)}
                placeholder="Pilot's name"
              />
            </div>

            {!deck && (
              <div className="space-y-1.5">
                <Label htmlFor="meta-deck-format">Format</Label>
                <Select
                  value={draft.format}
                  onValueChange={(value) => {
                    if (value !== null) {
                      set("format", value as string);
                    }
                  }}
                  items={formatLabels}
                >
                  <SelectTrigger id="meta-deck-format" className="mb-0 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formats.map((format) => (
                      <SelectItem key={format.slug} value={format.slug}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="meta-deck-status">How complete is the list?</Label>
              <Select
                value={draft.listStatus}
                onValueChange={(value) => {
                  if (value !== null) {
                    set("listStatus", value as MetaListStatus);
                  }
                }}
                items={LIST_STATUS_LABELS}
              >
                <SelectTrigger id="meta-deck-status" className="mb-0 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {META_LIST_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {LIST_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-deck-record">Record</Label>
              <Input
                id="meta-deck-record"
                value={draft.record}
                onChange={(e) => set("record", e.target.value)}
                placeholder="Optional, e.g. 5-1"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meta-deck-finish">Finish</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="meta-deck-finish"
                  value={draft.finishTier}
                  inputMode="numeric"
                  onChange={(e) => set("finishTier", e.target.value)}
                  className="w-24"
                />
                {FINISH_TIER_PRESETS.map((tier) => (
                  <Button
                    key={tier}
                    variant={draft.finishTier === String(tier) ? "default" : "outline"}
                    size="xs"
                    onClick={() => set("finishTier", String(tier))}
                  >
                    {formatFinishTier(tier)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {isArchetype ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ArchetypeCardPicker
                label="Legend"
                hint="Required. The archive files the entry under this card."
                cardsById={cardsById}
                cardId={draft.legendCardId}
                onPick={(cardId) => set("legendCardId", cardId)}
              />
              <ArchetypeCardPicker
                label="Champion"
                hint="Optional. Only if the source named one."
                cardsById={cardsById}
                cardId={draft.championCardId}
                onPick={(cardId) => set("championCardId", cardId)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="meta-deck-list">Decklist</Label>
              <Textarea
                id="meta-deck-list"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  deck
                    ? "Paste a replacement list, or leave empty to keep the stored cards..."
                    : "Paste a deck code, a text list, or a TTS string..."
                }
                className="min-h-32 font-mono text-base md:text-xs"
              />
              <Button
                variant="outline"
                onClick={handleParse}
                disabled={rawText.trim().length === 0}
              >
                Parse list
              </Button>
            </div>
          )}

          {!isArchetype && parsed && summary && (
            <>
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p>
                  Read as a {parsed.detected}:{" "}
                  <span className="font-medium">
                    {summary.copies} {summary.copies === 1 ? "copy" : "copies"}
                  </span>{" "}
                  across {summary.rows} {summary.rows === 1 ? "row" : "rows"}.
                </p>
                <p className="text-muted-foreground">
                  {zoneOrder
                    .filter((zone) => copiesByZone.has(zone))
                    .map((zone) => `${zoneLabels[zone]}: ${copiesByZone.get(zone)}`)
                    .join(" · ")}
                </p>
              </div>
              {parsed.needsReview.length > 0 && (
                <Alert variant="warning">
                  <AlertTitle>Matched by a close name, check these</AlertTitle>
                  <AlertDescription>
                    <ul className="list-inside list-disc">
                      {parsed.needsReview.map((entry) => (
                        <li key={`${entry.source}-${entry.matched}`}>
                          {entry.source} → {entry.matched}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {(parsed.unresolved.length > 0 || parsed.warnings.length > 0) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {parsed.unresolved.length > 0 && (
                      <>
                        <p>
                          {parsed.unresolved.length} line
                          {parsed.unresolved.length === 1 ? "" : "s"} matched no card and will be
                          dropped:
                        </p>
                        <ul className="list-inside list-disc">
                          {parsed.unresolved.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {parsed.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {formError && <p className="text-destructive text-sm">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {deck ? "Save" : "Archive deck"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
