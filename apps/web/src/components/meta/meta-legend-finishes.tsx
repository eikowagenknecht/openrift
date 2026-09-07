import { formatDay } from "@openrift/shared/format-date";
import type { MetaLegendFinish } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { MetaPlayerName } from "@/components/meta/meta-player-name";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Medal } from "@/components/ui/podium";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUserId } from "@/lib/auth-session";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import type { MetaFinishesView } from "@/lib/meta-legend-page";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";
import { cn } from "@/lib/utils";

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

/** A signed-out reader gets no submit link: the form is behind a login. */
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
        <MetaPlayerName
          name={finish.playerName}
          playerKey={finish.playerKey}
          className="truncate text-sm font-medium"
        />
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
            <MetaPlayerName
              name={finish.playerName}
              playerKey={finish.playerKey}
              className="truncate font-medium"
            />
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

/** `narrowed` only picks the empty-state message: "nothing on record" vs "nothing in this scope". */
export function MetaLegendFinishes({
  best,
  finishes,
  total,
  loadingMore = false,
  onShowMore,
  narrowed = false,
}: {
  best: readonly MetaLegendFinish[];
  finishes: readonly MetaLegendFinish[];
  total: number;
  loadingMore?: boolean;
  onShowMore: () => void;
  narrowed?: boolean;
}) {
  const canSubmit = useUserId() !== null;
  const [view, setView] = useState<MetaFinishesView>("best");

  if (total === 0) {
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

  const rows = view === "best" ? best : finishes;
  const remaining = total - rows.length;

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
              }
            }}
            aria-label="Which finishes to show"
          >
            <ToggleGroupItem value="best">Best</ToggleGroupItem>
            <ToggleGroupItem value="all">All {total.toLocaleString("en-US")}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Card className="gap-0 py-0">
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
              disabled={view === "all" && loadingMore}
              onClick={view === "best" ? () => setView("all") : onShowMore}
            >
              {view === "best"
                ? `Show all ${total.toLocaleString("en-US")} finishes`
                : `${remaining.toLocaleString("en-US")} more ${remaining === 1 ? "finish" : "finishes"}`}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
