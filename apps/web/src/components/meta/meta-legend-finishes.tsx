import type { MetaLegendFinish } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Medal } from "@/components/ui/podium";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUserId } from "@/lib/auth-session";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import type { MetaFinishesView } from "@/lib/meta-legend-page";
import { BEST_FINISH_COUNT, FINISH_PAGE_SIZE, sortLegendFinishes } from "@/lib/meta-legend-page";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";
import { cn } from "@/lib/utils";

/** The desktop column track, shared by the rows so they cannot drift apart. */
const FINISH_GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_6rem_9rem_4.5rem_5rem] items-center gap-x-3.5";

function Rank({ finish }: { finish: MetaLegendFinish }) {
  if (finish.rank <= MEDAL_RANKS) {
    return <Medal rank={finish.rank} />;
  }
  return (
    <span className="text-muted-foreground inline-block w-5 text-center text-sm tabular-nums">
      {formatRank(finish.rank, finish.rankIsTier)}
    </span>
  );
}

/**
 * What a finish offers about its list: the archived page when one is on file, and
 * otherwise the way to send it. A signed-out reader gets neither — the form is
 * behind a login, and an "+ Add" on every row of a long record leads nowhere.
 */
function ListLink({ finish, canSubmit }: { finish: MetaLegendFinish; canSubmit: boolean }) {
  if (finish.shareToken !== null) {
    return (
      <Link
        to="/meta/decks/$token"
        params={{ token: finish.shareToken }}
        className="text-primary font-medium whitespace-nowrap hover:underline"
      >
        {finish.listStatus === "partial" ? "Partial" : "Decklist"}
      </Link>
    );
  }
  if (!canSubmit) {
    return null;
  }
  return (
    <Link
      to="/meta/$slug/submit"
      params={{ slug: finish.event.slug }}
      search={metaSubmitSearchForPlayer(finish)}
      className="text-primary font-medium whitespace-nowrap hover:underline"
    >
      + Add
    </Link>
  );
}

/** The event's date and, where the source published one, its field size. */
function eventFacts(finish: MetaLegendFinish): string {
  const size = finish.event.playerCount;
  const parts = [formatDay(finish.event.eventDate)];
  if (size !== null) {
    parts.push(`${size.toLocaleString("en-US")} ${size === 1 ? "player" : "players"}`);
  }
  return parts.join(" · ");
}

function FinishRow({ finish, canSubmit }: { finish: MetaLegendFinish; canSubmit: boolean }) {
  const record = formatRecord(finish.wins, finish.losses, finish.draws);

  return (
    <li className="px-4 py-2.5 not-last:border-b">
      <div className={cn(FINISH_GRID, "hidden sm:grid")}>
        <Rank finish={finish} />
        <div className="min-w-0">
          <Link
            to="/meta/$slug"
            params={{ slug: finish.event.slug }}
            className="truncate font-medium hover:underline"
          >
            {finish.event.name}
          </Link>
          <p className="text-muted-foreground truncate text-xs tabular-nums">
            {eventFacts(finish)}
          </p>
        </div>
        <div>
          <MetaTierBadge tier={finish.event.tier} />
        </div>
        <span className="truncate text-sm font-medium">{finish.playerName}</span>
        <span className="text-right text-sm tabular-nums">{record}</span>
        <span className="text-right text-sm">
          <ListLink finish={finish} canSubmit={canSubmit} />
        </span>
      </div>

      <div className="flex items-start gap-2.5 sm:hidden">
        <span className="mt-0.5">
          <Rank finish={finish} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            to="/meta/$slug"
            params={{ slug: finish.event.slug }}
            className="truncate font-medium hover:underline"
          >
            {finish.event.name}
          </Link>
          <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
            <MetaTierBadge tier={finish.event.tier} />
            <span className="tabular-nums">{eventFacts(finish)}</span>
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
            <span className="truncate font-medium">{finish.playerName}</span>
            {record !== null && (
              <span className="text-muted-foreground tabular-nums">{record}</span>
            )}
            <ListLink finish={finish} canSubmit={canSubmit} />
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * One legend's tournament record: every archived standings row filed under it,
 * as published.
 *
 * "Best" leads with the placings; "All" is the record in the order it happened
 * and grows a page at a time. Both views hold the same rows, so the count beside
 * the toggle is always the number the list can reach.
 *
 * The rows arrive already narrowed by the page's scope bar; `narrowed` only
 * decides which empty state to write, since "nothing on record" and "nothing in
 * this scope" are different facts about the archive.
 */
export function MetaLegendFinishes({
  finishes,
  narrowed = false,
}: {
  finishes: readonly MetaLegendFinish[];
  narrowed?: boolean;
}) {
  const canSubmit = useUserId() !== null;
  const [view, setView] = useState<MetaFinishesView>("best");
  const [shown, setShown] = useState(FINISH_PAGE_SIZE);

  // The footer says "Show all N", so it shows all N. Leaving `shown` at one page
  // would page instead, and the button would have lied.
  const showAll = () => {
    setView("all");
    setShown(finishes.length);
  };

  if (finishes.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <Heading>Finishes</Heading>
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              {narrowed
                ? "No finish on this legend's record falls in this scope."
                : "No archived event has this legend on its standings yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const sorted = sortLegendFinishes(finishes, view);
  const rows = view === "best" ? sorted.slice(0, BEST_FINISH_COUNT) : sorted.slice(0, shown);
  const remaining = finishes.length - rows.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Heading>Finishes</Heading>
        <div className="ml-auto">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[view]}
            onValueChange={([next]) => {
              if (next === "best" || next === "all") {
                setView(next);
                setShown(FINISH_PAGE_SIZE);
              }
            }}
            aria-label="Which finishes to show"
          >
            <ToggleGroupItem value="best">Best</ToggleGroupItem>
            <ToggleGroupItem value="all">
              All {finishes.length.toLocaleString("en-US")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-lg ring-1">
        <ul className="flex flex-col">
          {rows.map((finish) => (
            <FinishRow key={finish.playerId} finish={finish} canSubmit={canSubmit} />
          ))}
        </ul>

        {remaining > 0 && (
          <div className="border-t">
            <Button
              variant="ghost"
              className="w-full rounded-none"
              onClick={view === "best" ? showAll : () => setShown(shown + FINISH_PAGE_SIZE)}
            >
              {view === "best"
                ? `Show all ${finishes.length.toLocaleString("en-US")} finishes`
                : `${remaining.toLocaleString("en-US")} more ${remaining === 1 ? "finish" : "finishes"}`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
