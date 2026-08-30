import type { MetaEventDetail } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { MetaContributors } from "@/components/meta/meta-contributors";
import { CountryFlag } from "@/components/ui/country-flag";

interface Fact {
  id: string;
  node: ReactNode;
}

/** The facts, separated by the middle dots the byline reads in. */
function FactRow({ facts }: { facts: readonly Fact[] }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {facts.map((fact, index) => (
        <Fragment key={fact.id}>
          {index > 0 && <span aria-hidden>·</span>}
          {fact.node}
        </Fragment>
      ))}
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
 */
function EventSources({ sources }: { sources: MetaEventDetail["sources"] }) {
  return (
    <span>
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
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
            >
              {source.label}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The byline under an archived event's title: when and where it was played, how
 * big the field was, and who ran it, then the citations and the people who typed
 * the entry in, on one attribution line.
 *
 * The flag and the venue are independently optional. The country is derived from
 * the venue address by a heuristic that gives up on formats it does not know, so
 * an event whose address never resolved still prints where it was played.
 *
 * The tier badge is deliberately absent — it rides beside the title in the page's
 * top bar, where it stays visible while the standings scroll.
 */
export function MetaEventHeader({ event }: { event: MetaEventDetail }) {
  const facts: Fact[] = [{ id: "date", node: <span>{formatDay(event.eventDate)}</span> }];

  if (event.country !== null || event.location !== null) {
    facts.push({
      id: "place",
      node: (
        <span className="flex items-center gap-1.5">
          <CountryFlag code={event.country} size="sm" showCode={event.location === null} />
          {event.location !== null && <span>{event.location}</span>}
        </span>
      ),
    });
  }
  if (event.playerCount !== null) {
    facts.push({
      id: "players",
      node: (
        <span>
          {event.playerCount} {event.playerCount === 1 ? "player" : "players"}
        </span>
      ),
    });
  }
  if (event.organizer !== null) {
    facts.push({ id: "organizer", node: <span>Organized by {event.organizer}</span> });
  }

  const attribution: Fact[] = [];
  if (event.sources.length > 0) {
    attribution.push({ id: "sources", node: <EventSources sources={event.sources} /> });
  }
  if (event.contributors.length > 0) {
    attribution.push({
      id: "credits",
      node: <MetaContributors contributors={event.contributors} />,
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <FactRow facts={facts} />
      {attribution.length > 0 && <FactRow facts={attribution} />}
    </div>
  );
}
