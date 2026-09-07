import type { AdminMetaPlayer, Card, DeckZone, MetaListStatus } from "@openrift/shared";
import { META_LIST_STATUSES, WellKnown, legendDisplayName } from "@openrift/shared";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useCreateMetaPlayer, useRenamePlayerDeck } from "@/hooks/use-admin-meta";
import { useWritePlayerOverlayFields } from "@/hooks/use-admin-meta-overlays";
import { useCards } from "@/hooks/use-cards";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";
import { useDeckFormatList, useZoneOrder } from "@/hooks/use-enums";
import type { MetaPlayerDraft } from "@/lib/admin-meta-draft";
import {
  RANK_PRESETS,
  metaPlayerDeckRename,
  metaPlayerOverlayFields,
  metaPlayerOverlayList,
  metaPlayerRank,
  metaPlayerRecordPart,
  metaPlayerToDraft,
  summarizeDeckCards,
  validateMetaPlayerDraft,
} from "@/lib/admin-meta-draft";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";
import type { DeckMatchedEntry } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportAuto } from "@/lib/deck-import-parsers";
import { errorText } from "@/lib/error-text";
import { formatRank } from "@/lib/meta-format";

function sourceLabel(entry: DeckMatchedEntry): string {
  return entry.entry.cardName ?? entry.entry.shortCode ?? "(unnamed line)";
}

interface ParseResult {
  cards: ImportedDeckCard[];
  needsReview: { source: string; matched: string }[];
  unresolved: string[];
  warnings: string[];
  detected: string;
}

const DETECTED_LABELS: Record<string, string> = {
  piltover: "deck code",
  text: "text list",
  tts: "TTS string",
};

const LIST_STATUS_LABELS: Record<MetaListStatus, string> = {
  none: "No list (standings only)",
  partial: "Partial list (main deck complete)",
  full: "Full list",
};

const isLegend = (card: Card) => card.types.includes(WellKnown.cardType.LEGEND);
const isChampionUnit = (card: Card) =>
  card.types.includes(WellKnown.cardType.UNIT) &&
  card.superTypes.includes(WellKnown.superType.CHAMPION);

function PlayerCardPicker({
  label,
  hint,
  placeholder,
  filter,
  cardsById,
  cardId,
  onPick,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  filter: (card: Card) => boolean;
  cardsById: Record<string, Card>;
  cardId: string | null;
  onPick: (cardId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, { wait: 150 });
  const results = useCatalogCardSearch(debouncedSearch, filter);

  const picked = cardId === null ? undefined : cardsById[cardId];

  if (picked) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-center gap-1">
          <span className="truncate font-medium">{legendDisplayName(picked)}</span>
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
        placeholder={placeholder}
        className="w-full"
      />
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
    </div>
  );
}

interface MetaPlayerDialogProps {
  eventId: string;
  eventFormat: string;
  player?: AdminMetaPlayer;
  onClose: () => void;
}

/** A decklist's cards come from the same paste-and-match pipeline as /decks/import. */
export function MetaPlayerDialog({ eventId, eventFormat, player, onClose }: MetaPlayerDialogProps) {
  const { allPrintings, cardsById } = useCards();
  const { formats, labels: formatLabels } = useDeckFormatList();
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const createPlayer = useCreateMetaPlayer();
  const writeOverlay = useWritePlayerOverlayFields();
  const renameDeck = useRenamePlayerDeck();

  const [draft, setDraft] = useState<MetaPlayerDraft>(() =>
    player
      ? metaPlayerToDraft(player, eventFormat)
      : {
          playerName: "",
          rank: "1",
          rankIsTier: false,
          wins: "",
          losses: "",
          draws: "",
          legendCardId: null,
          championCardId: null,
          listStatus: "none",
          deckName: "",
          deckFormat: eventFormat,
        },
  );
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [formError, setFormError] = useState("");

  const isPending = createPlayer.isPending || writeOverlay.isPending || renameDeck.isPending;
  const wantsList = draft.listStatus !== "none";
  const hasStoredList = player !== undefined && player.listStatus !== "none";

  function set<TKey extends keyof MetaPlayerDraft>(key: TKey, value: MetaPlayerDraft[TKey]) {
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

  /**
   * Claims only what moved. A rename with no new list is its own call: the
   * deck name is a durable write, not a claim.
   */
  async function saveEdit(current: AdminMetaPlayer, cards: ImportedDeckCard[]): Promise<void> {
    const fields = metaPlayerOverlayFields(current, draft);
    const list = metaPlayerOverlayList(current, draft, cards);
    if (Object.keys(fields).length > 0 || list !== undefined) {
      await writeOverlay.mutateAsync({ id: current.id, fields, list });
    }
    const deckName = metaPlayerDeckRename(current, draft, cards);
    if (deckName !== null) {
      await renameDeck.mutateAsync({ id: current.id, eventId, name: deckName });
    }
  }

  async function handleSubmit() {
    const problem = validateMetaPlayerDraft(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    const rank = metaPlayerRank(draft.rank);
    if (rank === null) {
      setFormError("Finish must be a positive whole number");
      return;
    }

    const cards = parsed?.cards ?? [];
    if (wantsList && cards.length === 0 && !hasStoredList) {
      setFormError("Paste a decklist and parse it, or file this player with no list.");
      return;
    }

    // Creating still writes the whole row: there is nothing there yet to leave
    // alone.
    const save: () => Promise<unknown> = player
      ? () => saveEdit(player, cards)
      : () =>
          createPlayer.mutateAsync({
            eventId,
            playerName: draft.playerName.trim(),
            rank,
            rankIsTier: draft.rankIsTier,
            wins: metaPlayerRecordPart(draft.wins),
            losses: metaPlayerRecordPart(draft.losses),
            draws: metaPlayerRecordPart(draft.draws),
            legendCardId: draft.legendCardId,
            championCardId: draft.championCardId,
            list:
              wantsList && cards.length > 0
                ? {
                    name: draft.deckName.trim(),
                    format: draft.deckFormat.trim(),
                    cards,
                    listStatus: draft.listStatus === "partial" ? "partial" : "full",
                  }
                : null,
          });

    const successMessage = player
      ? `Updated ${draft.playerName.trim()}`
      : `Filed ${draft.playerName.trim()}`;
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
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>{player ? "Edit standings row" : "Add a player"}</DialogTitle>
            <DialogDescription>
              Who played and how they finished. A decklist is optional.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meta-player-name">Player</Label>
              <Input
                id="meta-player-name"
                value={draft.playerName}
                onChange={(e) => set("playerName", e.target.value)}
                placeholder="Player's name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-player-wins">Record</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="meta-player-wins"
                  value={draft.wins}
                  inputMode="numeric"
                  aria-label="Wins"
                  placeholder="W"
                  className="w-16"
                  onChange={(e) => set("wins", e.target.value)}
                />
                <Input
                  value={draft.losses}
                  inputMode="numeric"
                  aria-label="Losses"
                  placeholder="L"
                  className="w-16"
                  onChange={(e) => set("losses", e.target.value)}
                />
                <Input
                  value={draft.draws}
                  inputMode="numeric"
                  aria-label="Draws"
                  placeholder="D"
                  className="w-16"
                  onChange={(e) => set("draws", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meta-player-rank">Finish</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="meta-player-rank"
                  value={draft.rank}
                  inputMode="numeric"
                  onChange={(e) => set("rank", e.target.value)}
                  className="w-24"
                />
                {RANK_PRESETS.map((rank) => (
                  <Button
                    key={rank}
                    variant={draft.rank === String(rank) ? "default" : "outline"}
                    size="xs"
                    onClick={() => set("rank", String(rank))}
                  >
                    {formatRank(rank, draft.rankIsTier)}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="meta-player-rank-is-tier"
                  checked={draft.rankIsTier}
                  onCheckedChange={(checked) => set("rankIsTier", checked === true)}
                />
                <Label htmlFor="meta-player-rank-is-tier" className="font-normal">
                  The source only published a bracket, so print it as T{draft.rank || "8"}
                </Label>
              </div>
            </div>

            <PlayerCardPicker
              label="Legend"
              hint={wantsList ? "A parsed decklist fills this from its legend zone." : undefined}
              placeholder="Search legends…"
              filter={isLegend}
              cardsById={cardsById}
              cardId={draft.legendCardId}
              onPick={(cardId) => set("legendCardId", cardId)}
            />
            <PlayerCardPicker
              label="Champion"
              placeholder="Search champion units…"
              filter={isChampionUnit}
              cardsById={cardsById}
              cardId={draft.championCardId}
              onPick={(cardId) => set("championCardId", cardId)}
            />

            <div className="space-y-1.5">
              <Label htmlFor="meta-player-status">Decklist status</Label>
              <Select
                value={draft.listStatus}
                onValueChange={(value) => {
                  if (value !== null) {
                    set("listStatus", value as MetaListStatus);
                  }
                }}
                items={LIST_STATUS_LABELS}
              >
                <SelectTrigger id="meta-player-status" className="w-full">
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
              {hasStoredList && !wantsList && (
                <p className="text-muted-foreground text-sm">
                  Saving removes the archived deck and its permalink, and keeps it removed even if a
                  source publishes the list again.
                </p>
              )}
            </div>

            {wantsList && (
              <div className="space-y-1.5">
                <Label htmlFor="meta-player-deck-name">Deck name</Label>
                <Input
                  id="meta-player-deck-name"
                  value={draft.deckName}
                  onChange={(e) => set("deckName", e.target.value)}
                  placeholder="Yasuo Aggro"
                />
              </div>
            )}

            {wantsList && player === undefined && (
              <div className="space-y-1.5">
                <Label htmlFor="meta-player-deck-format">Format</Label>
                <Select
                  value={draft.deckFormat}
                  onValueChange={(value) => {
                    if (value !== null) {
                      set("deckFormat", value as string);
                    }
                  }}
                  items={formatLabels}
                >
                  <SelectTrigger id="meta-player-deck-format" className="w-full">
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
          </div>

          {wantsList && (
            <div className="space-y-2">
              <Label htmlFor="meta-player-list">Decklist</Label>
              <Textarea
                id="meta-player-list"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  hasStoredList
                    ? "Paste a replacement list, or leave empty to keep the stored cards…"
                    : "Paste a deck code, a text list, or a TTS string…"
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

          {wantsList && parsed && summary && (
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
              {player ? "Save" : "Add player"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
