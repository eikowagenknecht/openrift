import type { MetaEventDetail } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { Fragment } from "react";

import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MarkdownText } from "@/components/markdown-text";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { MetaDeckRow } from "@/components/meta/meta-deck-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useMetaEvent } from "@/hooks/use-meta";
import { useUserId } from "@/lib/auth-session";

/**
 * The event's own line of metadata: date, format, field size, organizer.
 * Attribution is no longer part of it — see {@link EventSources}.
 * @returns The metadata block.
 */
function EventMeta({ event }: { event: MetaEventDetail }) {
  const { labels: formatLabels } = useDeckFormatList();
  const facts = [
    formatDay(event.eventDate),
    event.playerCount === null ? null : `${event.playerCount} players`,
    event.organizer,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Badge variant="outline">{formatLabels[event.format] ?? event.format}</Badge>
      <span className="text-muted-foreground">{facts.join(" · ")}</span>
    </div>
  );
}

/**
 * Where this event's data came from (ADR-014). One event is fed by several
 * sources — uvsgames posts the standings, playriftbound the lists — so this is
 * a list rather than the single link it replaced.
 *
 * Every citation is printed. None is collapsed behind a "+2 more" and none is
 * truncated: this is attribution, and a source that fed the page is owed its
 * credit whether it is the first or the fourth. A hand-entered citation (an
 * admin transcribing from a VOD or a photo of the standings board) carries no
 * URL, so it renders as plain text rather than a dead link.
 *
 * @param props.sources The event's citations, in the order the server sends them.
 * @returns The citation line, or null when the event has no sources.
 */
function EventSources({ sources }: { sources: MetaEventDetail["sources"] }) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <p className="text-muted-foreground mt-2 text-sm">
      {sources.length === 1 ? "Source" : "Sources"}:{" "}
      {sources.map((source, index) => (
        <Fragment key={source.id}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          {source.sourceUrl === null ? (
            <span>{source.label}</span>
          ) : (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {source.label}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * How someone who was at the tournament adds to it (ADR-014's User
 * submissions). This is the archive's main way in: a reader looking at an event
 * whose top 8 is half-empty is exactly the person who can fill it.
 *
 * The `meta` flag needs no check here — the route redirects to /cards when it
 * is off, so nothing on this page renders while the archive is unlaunched.
 *
 * Signing in does gate the form, so a logged-out reader is told that before
 * they click rather than being bounced into a login screen with no reason
 * given, and the link carries them back to the form afterwards.
 *
 * @param props.slug The event this would add a deck to.
 * @returns The call to action.
 */
function AddDeckCta({ slug }: { slug: string }) {
  const userId = useUserId();

  if (userId === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Know a list from this event?{" "}
        <Link
          to="/login"
          search={{ redirect: `/meta/${slug}/submit`, email: undefined }}
          className="underline underline-offset-4"
        >
          Sign in to send it
        </Link>
        .
      </p>
    );
  }

  return (
    <Button variant="outline" size="sm" render={<Link to="/meta/$slug/submit" params={{ slug }} />}>
      <PlusIcon />
      Add a decklist
    </Button>
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
        <EventSources sources={event.sources} />
        <MetaContributors contributors={event.contributors} className="mt-1" />

        {event.notes !== null && event.notes !== "" && (
          <div className="mt-4">
            {/* Admin-curated copy, so any http(s) host in it is linkable. */}
            <MarkdownText text={event.notes} trusted />
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Heading>Decks</Heading>
            <AddDeckCta slug={slug} />
          </div>
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
