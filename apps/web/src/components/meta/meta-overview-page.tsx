import type { MetaEventSummary } from "@openrift/shared";
import { Link, getRouteApi } from "@tanstack/react-router";
import { TrophyIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Heading } from "@/components/heading";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MetaStatsPanels } from "@/components/meta/meta-stats-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { DatePicker } from "@/components/ui/date-picker";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsAdmin } from "@/hooks/use-admin";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useMetaEvents, useMetaStats } from "@/hooks/use-meta";
import { formatAbsoluteDate } from "@/lib/format-date";

const routeApi = getRouteApi("/_app/meta");

/** Shared by the meta description, the JSON-LD, and the visible page intro. */
export const META_DESCRIPTION =
  "Decklists from Riftbound tournaments, with the cards and legends they were built on. Every list links into the catalog and shows what you already own.";

/** The format select's "no filter" value — an empty string clears the param. */
const ALL_FORMATS = "";

const EVENT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

function EventRow({ event }: { event: MetaEventSummary }) {
  const { labels: formatLabels } = useDeckFormatList();
  const details = [
    event.organizer,
    event.playerCount === null ? null : `${event.playerCount} players`,
    `${event.deckCount} ${event.deckCount === 1 ? "deck" : "decks"}`,
  ].filter(Boolean);

  return (
    <CardLink render={<Link to="/meta/$slug" params={{ slug: event.slug }} />}>
      <CardContent className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Heading as="h3" className="truncate">
            {event.name}
          </Heading>
          <p className="text-muted-foreground truncate text-sm">{details.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatAbsoluteDate(event.eventDate, EVENT_DATE_OPTIONS)}
          </span>
          <Badge variant="outline">{formatLabels[event.format] ?? event.format}</Badge>
        </div>
      </CardContent>
    </CardLink>
  );
}

/** @returns The empty state, with a create CTA only an admin sees. */
function MetaEmptyState() {
  const { data: isAdmin } = useIsAdmin();
  return (
    <EmptyState
      className="py-12"
      icon={TrophyIcon}
      title="No events archived yet"
      description="Tournament results land here as soon as they are entered."
    >
      {isAdmin === true && <Button render={<Link to="/admin/meta" />}>Add an event</Button>}
    </EmptyState>
  );
}

/**
 * The format / date-range controls. They drive the stats request server-side
 * (that is what the stats endpoint's params are for) and narrow the event list
 * client-side from the same values.
 * @returns The filter row.
 */
function MetaFilters({ formats }: { formats: string[] }) {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { labels: formatLabels } = useDeckFormatList();

  const update = (patch: Partial<{ format: string; from: string; to: string }>) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        return Object.fromEntries(
          Object.entries(next).filter(([, value]) => value !== undefined && value !== ""),
        );
      },
    });
  };

  const formatItems: Record<string, string> = { [ALL_FORMATS]: "All formats" };
  for (const slug of formats) {
    formatItems[slug] = formatLabels[slug] ?? slug;
  }

  const hasFilters =
    search.format !== undefined || search.from !== undefined || search.to !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={search.format ?? ALL_FORMATS}
        onValueChange={(value) => update({ format: (value as string | null) ?? ALL_FORMATS })}
        items={formatItems}
      >
        <SelectTrigger className="w-44" aria-label="Format">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(formatItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DatePicker
        value={search.from ?? ""}
        onChange={(iso) => update({ from: iso })}
        onClear={() => update({ from: undefined })}
        placeholder="From"
        className="w-44"
      />
      <DatePicker
        value={search.to ?? ""}
        onChange={(iso) => update({ to: iso })}
        onClear={() => update({ to: undefined })}
        placeholder="To"
        className="w-44"
      />
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => update({ format: undefined, from: undefined, to: undefined })}
        >
          Reset filters
        </Button>
      )}
    </div>
  );
}

/**
 * `/meta` — the archive's overview: the two meta aggregates over the selected
 * scope, then every archived event newest first (ADR-014).
 * @returns The overview page.
 */
export function MetaOverviewPage() {
  const search = routeApi.useSearch();
  const { data: eventsData } = useMetaEvents();
  const { data: stats } = useMetaStats({
    format: search.format,
    dateFrom: search.from,
    dateTo: search.to,
  });

  const allEvents = eventsData.events;
  const formats = [...new Set(allEvents.map((event) => event.format))].sort((left, right) =>
    left.localeCompare(right),
  );
  // The event list narrows from the same controls the stats use, so the two
  // halves of the page always describe the same scope.
  const events = allEvents.filter((event) => {
    if (search.format !== undefined && event.format !== search.format) {
      return false;
    }
    if (search.from !== undefined && event.eventDate < search.from) {
      return false;
    }
    return search.to === undefined || event.eventDate <= search.to;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarTitle>Meta</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className="px-safe mx-auto w-full max-w-5xl pt-3 pb-6">
        <PageDescription className="pb-4">{META_DESCRIPTION}</PageDescription>

        {allEvents.length === 0 ? (
          <MetaEmptyState />
        ) : (
          <div className="flex flex-col gap-8">
            <MetaFilters formats={formats} />

            <p className="text-muted-foreground text-sm">
              {stats.totalDecks} archived {stats.totalDecks === 1 ? "deck" : "decks"} in scope.
            </p>

            <MetaStatsPanels stats={stats} />

            <section>
              <Heading className="mb-3">Events</Heading>
              {events.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyDescription>No events match these filters.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-3">
                  {events.map((event) => (
                    <li key={event.id}>
                      <EventRow event={event} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
