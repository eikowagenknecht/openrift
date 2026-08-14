import type { MetaEventDetail } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MarkdownText } from "@/components/markdown-text";
import { MetaDeckRow } from "@/components/meta/meta-deck-row";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useMetaEvent } from "@/hooks/use-meta";
import { formatAbsoluteDate } from "@/lib/format-date";

const EVENT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

/**
 * The event's own line of metadata: date, format, field size, organizer, plus
 * the external attribution link where there is one.
 * @returns The metadata block.
 */
function EventMeta({ event }: { event: MetaEventDetail }) {
  const { labels: formatLabels } = useDeckFormatList();
  const facts = [
    formatAbsoluteDate(event.eventDate, EVENT_DATE_OPTIONS),
    event.playerCount === null ? null : `${event.playerCount} players`,
    event.organizer,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Badge variant="outline">{formatLabels[event.format] ?? event.format}</Badge>
      <span className="text-muted-foreground">{facts.join(" · ")}</span>
      {event.sourceUrl !== null && (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground inline-flex items-center gap-1 hover:underline"
        >
          Source
          <ExternalLinkIcon className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/**
 * `/meta/$slug` — one archived event: its metadata, its notes, and its decks in
 * finish order (ADR-014).
 * @returns The event page.
 */
export function MetaEventPage({ slug }: { slug: string }) {
  const { data } = useMetaEvent(slug);
  const { event, decks } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>{event.name}</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className="px-safe mx-auto w-full max-w-5xl pt-3 pb-6">
        <EventMeta event={event} />

        {event.notes !== null && event.notes !== "" && (
          <div className="mt-4">
            {/* Admin-curated copy, so any http(s) host in it is linkable. */}
            <MarkdownText text={event.notes} trusted />
          </div>
        )}

        <section className="mt-8">
          <Heading className="mb-3">Decks</Heading>
          {decks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>
                  We haven&rsquo;t archived any decks from this event yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {decks.map((deck) => (
                <li key={deck.deckId}>
                  <MetaDeckRow deck={deck} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-muted-foreground mt-8 text-sm">
          <Link to="/meta/decks" className="hover:underline">
            Browse every archived deck
          </Link>
        </p>
      </div>
    </div>
  );
}
