import type { MetaDeckSummary } from "@openrift/shared/types/api/meta";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { MetaArchiveDeckTile } from "@/features/meta/components/meta-archive-deck-tile";
import { DECK_GRID_LIMIT } from "@/features/meta/lib/meta-deck-grid";
import { useDisplayStore } from "@/stores/display-store";

type MetaArchivedDecksSubject = "legend" | "player";

const EMPTY_DESCRIPTION: Record<MetaArchivedDecksSubject, string> = {
  legend: "No list on this legend's record falls in this scope.",
  player: "No list on this player's record falls in this scope.",
};

/** `total` may exceed `decks.length`; `onShowAll` fetches the rest. */
export function MetaArchivedDecks({
  decks,
  total,
  subject,
  onShowAll,
}: {
  decks: readonly MetaDeckSummary[];
  total: number;
  subject: MetaArchivedDecksSubject;
  onShowAll?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const shown = expanded ? decks : decks.slice(0, DECK_GRID_LIMIT);
  // "Show all" is a one-shot: once it has run the grid holds everything the
  // scope left, even where that is fewer rows than `total` promised.
  const remaining = expanded ? 0 : total - shown.length;

  if (decks.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <Heading>Archived decklists</Heading>
        <Empty>
          <EmptyHeader>
            <EmptyDescription>{EMPTY_DESCRIPTION[subject]}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <Heading>Archived decklists</Heading>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((deck) => (
          <li key={deck.deckId}>
            <MetaArchiveDeckTile deck={deck} marketplace={marketplace} showEvent />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setExpanded(true);
              onShowAll?.();
            }}
          >
            Show all {total.toLocaleString("en-US")} decklists
          </Button>
        </div>
      )}
    </section>
  );
}
