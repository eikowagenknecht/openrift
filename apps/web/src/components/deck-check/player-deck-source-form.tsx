import type { DeckCheckSubmissionResultResponse } from "@openrift/shared/types/api/deck-check";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDecks } from "@/hooks/use-decks";
import { parseManualDecklist } from "@/lib/deck-check-manual-entry";

export interface DeckSourceInput {
  deckId?: string;
  deckCode?: string;
  cards?: { name: string; quantity: number; section: string }[];
  allowDeckPublishing: boolean;
  allowNameSharing: boolean;
  allowRiotIdSharing: boolean;
}

const NO_DECK = "__none__";

type DeckSource = Omit<
  DeckSourceInput,
  "allowDeckPublishing" | "allowNameSharing" | "allowRiotIdSharing"
>;

function pasteToInput(paste: string): DeckSource | null {
  const trimmed = paste.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/\s/u.test(trimmed)) {
    return { deckCode: trimmed };
  }
  const parsed = parseManualDecklist(trimmed);
  return parsed.cards.length > 0 ? { cards: parsed.cards } : null;
}

export function PlayerDeckSourceForm({
  submitLabel,
  pendingLabel,
  isSubmitting,
  onSubmit,
  onPreview,
  preview,
  isPreviewing,
  initialAllowDeckPublishing = true,
  initialAllowNameSharing = true,
  initialAllowRiotIdSharing = true,
}: {
  submitLabel: string;
  pendingLabel: string;
  isSubmitting: boolean;
  onSubmit: (input: DeckSourceInput) => void;
  onPreview: (input: DeckSourceInput) => void;
  preview: DeckCheckSubmissionResultResponse | null;
  isPreviewing: boolean;
  initialAllowDeckPublishing?: boolean;
  initialAllowNameSharing?: boolean;
  initialAllowRiotIdSharing?: boolean;
}) {
  const { data: allDecks } = useDecks();
  const [deckId, setDeckId] = useState(NO_DECK);
  const [deckCode, setDeckCode] = useState("");
  const [allowDeckPublishing, setAllowDeckPublishing] = useState(initialAllowDeckPublishing);
  const [allowNameSharing, setAllowNameSharing] = useState(initialAllowNameSharing);
  const [allowRiotIdSharing, setAllowRiotIdSharing] = useState(initialAllowRiotIdSharing);

  const decks = allDecks.filter((item) => item.deck.archivedAt === null);
  const deckItems = [
    { value: NO_DECK, label: "Pick a deck..." },
    ...decks.map((item) => ({ value: item.deck.id, label: item.deck.name })),
  ];

  // The sources are mutually exclusive; touching one clears the other.
  const source: DeckSource | null = deckId === NO_DECK ? pasteToInput(deckCode) : { deckId };
  const input: DeckSourceInput | null = source
    ? { ...source, allowDeckPublishing, allowNameSharing, allowRiotIdSharing }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="player-deck-select">From your decks</Label>
        <Select
          items={deckItems}
          value={deckId}
          onValueChange={(value) => {
            setDeckId(value ?? NO_DECK);
            if (value && value !== NO_DECK) {
              setDeckCode("");
            }
          }}
        >
          <SelectTrigger id="player-deck-select" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {deckItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="player-deck-code">Or paste a deck code / card list</Label>
        <Textarea
          id="player-deck-code"
          value={deckCode}
          placeholder={
            "Deck code, or a list grouped by zone:\n\nChampion:\n1 Twisted Fate, Gambler\n\nMainDeck:\n3 Mystic Poro"
          }
          rows={7}
          onChange={(event) => {
            setDeckCode(event.target.value);
            if (event.target.value.trim().length > 0) {
              setDeckId(NO_DECK);
            }
          }}
        />
        <p className="text-muted-foreground text-sm">
          Paste a deck code from OpenRift or{" "}
          <a
            href="https://piltoverarchive.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Piltover Archive
          </a>
          , or an exported text list. Zone headers like &quot;Champion:&quot; apply until the next
          header, and lines without one count as main deck.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Public sharing</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="player-deck-publish"
            checked={allowDeckPublishing}
            onCheckedChange={(checked) => setAllowDeckPublishing(checked === true)}
          />
          <Label htmlFor="player-deck-publish" className="font-normal">
            I agree the event organizer may publish this deck list publicly after the event
          </Label>
        </div>
        <div className="ml-6 flex items-center gap-2">
          <Checkbox
            id="player-deck-share-name"
            checked={allowNameSharing}
            disabled={!allowDeckPublishing}
            onCheckedChange={(checked) => setAllowNameSharing(checked === true)}
          />
          <Label
            htmlFor="player-deck-share-name"
            className="font-normal data-[disabled]:opacity-50"
            data-disabled={!allowDeckPublishing || undefined}
          >
            ...including my name
          </Label>
        </div>
        <div className="ml-6 flex items-center gap-2">
          <Checkbox
            id="player-deck-share-riot-id"
            checked={allowRiotIdSharing}
            disabled={!allowDeckPublishing}
            onCheckedChange={(checked) => setAllowRiotIdSharing(checked === true)}
          />
          <Label
            htmlFor="player-deck-share-riot-id"
            className="font-normal data-[disabled]:opacity-50"
            data-disabled={!allowDeckPublishing || undefined}
          >
            ...including my Riot ID
          </Label>
        </div>
        <p className="text-muted-foreground text-sm">
          These choices only control how much the organizer may publish publicly, for example on
          riftdecks.com or OpenRift. The event judges always see your full list and details.
        </p>
      </div>

      {preview ? <PreviewSummary preview={preview} /> : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={!input || isPreviewing}
          onClick={() => input && onPreview(input)}
        >
          {isPreviewing ? "Checking..." : "Preview"}
        </Button>
        <Button disabled={!input || isSubmitting} onClick={() => input && onSubmit(input)}>
          {isSubmitting ? pendingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function PreviewSummary({ preview }: { preview: DeckCheckSubmissionResultResponse }) {
  const totalCopies = preview.cards.reduce((sum, card) => sum + card.quantity, 0);
  const unmatched = preview.cards.filter((card) => card.matchStatus !== "matched");
  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3 text-sm">
      <p>
        {totalCopies} cards across {preview.cards.length} lines.
      </p>
      {unmatched.length > 0 ? (
        <p className="text-warning flex items-start gap-1.5">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Not recognized: {unmatched.map((card) => card.rawName).join(", ")}. These show as
            placeholders for the judge.
          </span>
        </p>
      ) : null}
      {preview.violations.length > 0 ? (
        <ul className="text-warning flex list-disc flex-col gap-1 pl-5">
          {preview.violations.map((violation) => (
            <li key={`${violation.zone}:${violation.code}:${violation.cardId ?? ""}`}>
              {violation.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No legality warnings.</p>
      )}
      <p className="text-muted-foreground">
        These findings are advisory. You can still submit and a judge decides.
      </p>
    </div>
  );
}
