import type { DeckCheckSubmissionResultResponse } from "@openrift/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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

/**
 * The ways a player can provide a list: an own deck, a pasted compact deck
 * code, or the parsed lines of a pasted text list.
 */
export interface DeckSourceInput {
  deckId?: string;
  deckCode?: string;
  cards?: { name: string; quantity: number; section: string }[];
}

const NO_DECK = "__none__";

/**
 * Classifies a paste and converts it to a submission input. A compact deck
 * code is one whitespace-free token; anything with spaces or line breaks is
 * treated as a text decklist and parsed like the judge's manual entry.
 * @returns The input, or null when the paste yields no cards.
 */
function pasteToInput(paste: string): DeckSourceInput | null {
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

/**
 * The shared submission form (ADR-026): pick one of the player's own decks or
 * paste a deck code / text decklist, preview the resolved list with its
 * advisory legality findings, then submit. Used by both the token submission
 * page and the entry's replace-deck dialog.
 * @returns The form.
 */
export function PlayerDeckSourceForm({
  submitLabel,
  pendingLabel,
  isSubmitting,
  onSubmit,
  onPreview,
  preview,
  isPreviewing,
}: {
  submitLabel: string;
  pendingLabel: string;
  isSubmitting: boolean;
  onSubmit: (input: DeckSourceInput) => void;
  onPreview: (input: DeckSourceInput) => void;
  preview: DeckCheckSubmissionResultResponse | null;
  isPreviewing: boolean;
}) {
  const { data: allDecks } = useDecks();
  const [deckId, setDeckId] = useState(NO_DECK);
  const [deckCode, setDeckCode] = useState("");

  const decks = allDecks.filter((item) => item.deck.archivedAt === null);
  const deckItems = [
    { value: NO_DECK, label: "Pick a deck..." },
    ...decks.map((item) => ({ value: item.deck.id, label: item.deck.name })),
  ];

  // The sources are mutually exclusive; touching one clears the other.
  const input: DeckSourceInput | null = deckId === NO_DECK ? pasteToInput(deckCode) : { deckId };

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
          placeholder={"Deck code, or one card per line:\n3 Blazing Scorcher"}
          rows={3}
          onChange={(event) => {
            setDeckCode(event.target.value);
            if (event.target.value.trim().length > 0) {
              setDeckId(NO_DECK);
            }
          }}
        />
        <p className="text-muted-foreground text-sm">
          Accepts the compact code from OpenRift&apos;s deck export or{" "}
          <a
            href="https://piltoverarchive.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Piltover Archive
          </a>
          , or a plain card list with one card per line. Legends, runes, and battlefields find their
          zones automatically; mark your chosen champion and any sideboard with
          &quot;Champion:&quot; / &quot;Sideboard:&quot; header lines.
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

/**
 * What the dry run resolved: card counts, lines the catalog could not
 * identify, and the advisory legality findings. None of it blocks submitting;
 * the judge decides.
 * @returns The preview panel.
 */
function PreviewSummary({ preview }: { preview: DeckCheckSubmissionResultResponse }) {
  const totalCopies = preview.cards.reduce((sum, card) => sum + card.quantity, 0);
  const unmatched = preview.cards.filter((card) => card.matchStatus !== "matched");
  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3 text-sm">
      <p>
        {totalCopies} cards across {preview.cards.length} lines.
      </p>
      {unmatched.length > 0 ? (
        <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Not recognized: {unmatched.map((card) => card.rawName).join(", ")}. These show as
            placeholders for the judge.
          </span>
        </p>
      ) : null}
      {preview.violations.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-amber-600 dark:text-amber-500">
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
        These findings are advisory; you can still submit and a judge decides.
      </p>
    </div>
  );
}
