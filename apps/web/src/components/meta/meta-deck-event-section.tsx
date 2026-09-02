import type { Marketplace, MetaDeckSummary, MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import { metaEventCounts } from "@/lib/meta-format";

/** One row at the widest grid. */
export const PREVIEW_TILES = 5;

function fieldSizeOf(summary?: MetaEventSummary): number | undefined {
  if (summary === undefined) {
    return undefined;
  }
  return summary.playerCount ?? (summary.playerRowCount === 0 ? undefined : summary.playerRowCount);
}

export function MetaDeckEventSection({
  event,
  summary,
  decks,
  costs,
  marketplace,
  defaultExpanded = false,
}: {
  event: MetaDeckSummary["event"];
  summary?: MetaEventSummary;
  decks: readonly MetaDeckSummary[];
  costs?: ReadonlyMap<string, MetaDeckCost>;
  marketplace: Marketplace;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const leaf = dateLeafPartsUtc(event.eventDate);
  const venue =
    summary === undefined ? "" : [summary.organizer, summary.location].filter(Boolean).join(" · ");
  const counts = summary === undefined ? [] : metaEventCounts(summary);
  const fieldSize = fieldSizeOf(summary);
  const shown = expanded ? decks : decks.slice(0, PREVIEW_TILES);
  const folded = decks.length - PREVIEW_TILES;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <DateLeaf month={leaf.month} day={leaf.day} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/meta/$slug"
              params={{ slug: event.slug }}
              className="truncate hover:underline"
            >
              {event.name}
            </Link>
            <MetaTierBadge tier={event.tier} />
            <CountryFlag code={event.country} size="sm" />
          </Heading>
          {(venue !== "" || counts.length > 0) && (
            <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
              {venue !== "" && <span className="truncate">{venue}</span>}
              {counts.length > 0 && <span className="tabular-nums">{counts.join(" · ")}</span>}
            </p>
          )}
        </div>
        <Link
          to="/meta/$slug"
          params={{ slug: event.slug }}
          className="text-primary hidden shrink-0 items-center gap-1 text-sm font-medium hover:underline sm:flex"
        >
          Standings
          <ChevronRightIcon aria-hidden className="size-4" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((deck) => (
          <li key={deck.deckId}>
            <MetaArchiveDeckTile
              deck={deck}
              cost={costs?.get(deck.deckId)}
              fieldSize={fieldSize}
              marketplace={marketplace}
            />
          </li>
        ))}
      </ul>

      {folded > 0 && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? (
              <ChevronUpIcon aria-hidden className="size-4" />
            ) : (
              <ChevronDownIcon aria-hidden className="size-4" />
            )}
            {expanded
              ? "Show fewer"
              : `Show the other ${folded} ${folded === 1 ? "list" : "lists"}`}
          </Button>
        </div>
      )}
    </section>
  );
}
