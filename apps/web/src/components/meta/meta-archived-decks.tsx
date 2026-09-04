import type { MetaDeckSummary } from "@openrift/shared";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { DECK_GRID_LIMIT } from "@/lib/meta-deck-grid";
import { useDisplayStore } from "@/stores/display-store";

type MetaArchivedDecksSubject = "legend" | "player";

const EMPTY_DESCRIPTION: Record<MetaArchivedDecksSubject, string> = {
  legend: "No list on this legend's record falls in this scope.",
  player: "No list on this player's record falls in this scope.",
};

/**
 * The archived lists a legend or a player page holds, as a grid.
 *
 * The rest of the lists arrive in place rather than behind a link: the deck
 * browser has no per-legend or per-player address, and sending a reader to the
 * unfiltered archive would promise a narrower list than it opens on.
 *
 * `total` is the lists the scope holds, which a page may know before it holds
 * them: the legend page renders one grid's worth from the server and asks for
 * the rest through `onShowAll`.
 */
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
