import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { MarkdownText } from "@/components/markdown-text";
import { MetaEventBracket } from "@/components/meta/meta-event-bracket";
import { MetaEventDecklists } from "@/components/meta/meta-event-decklists";
import { MetaEventHeader } from "@/components/meta/meta-event-header";
import { MetaEventPodium } from "@/components/meta/meta-event-podium";
import { MetaEventStandings } from "@/components/meta/meta-event-standings";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { useMetaEvent } from "@/hooks/use-meta";
import { useUserId } from "@/lib/auth-session";
import { cn, PAGE_WIDTH } from "@/lib/utils";

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
 */
function AddDeckCta({ slug }: { slug: string }) {
  const userId = useUserId();

  if (userId === null) {
    return (
      <PageTopBarPrimaryButton
        render={
          <Link to="/login" search={{ redirect: `/meta/${slug}/submit`, email: undefined }} />
        }
      >
        <PlusIcon />
        Sign in to add a decklist
      </PageTopBarPrimaryButton>
    );
  }

  return (
    <PageTopBarPrimaryButton render={<Link to="/meta/$slug/submit" params={{ slug }} />}>
      <PlusIcon />
      Add a decklist
    </PageTopBarPrimaryButton>
  );
}

/**
 * `/meta/$slug` — one archived event, top-down: who won it, how the cut played
 * out, the lists the archive holds, and the whole field behind them (ADR-014).
 *
 * Every section stands down on its own when the archive has nothing for it, so
 * an event that arrived as bare standings still reads as a finished page rather
 * than a page with holes in it.
 */
export function MetaEventPage({ slug }: { slug: string }) {
  const { data } = useMetaEvent(slug);
  const { event, players, matches, phases } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TopBarBreadcrumbTrail
              segments={[{ label: "Meta Archive", link: <Link to="/meta" /> }]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{event.name}</PageTopBarTitle>
            <MetaTierBadge tier={event.tier} />
          </div>
          <PageTopBarActions>
            <AddDeckCta slug={slug} />
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-10")}>
        <MetaEventHeader event={event} />

        {event.notes !== null && event.notes !== "" && (
          <div className="mt-4">
            {/* Admin-curated copy, so any http(s) host in it is linkable. */}
            <MarkdownText text={event.notes} links="any" />
          </div>
        )}

        <div className="mt-6">
          <MetaEventPodium players={players} />
        </div>

        <MetaEventBracket matches={matches} phases={phases} players={players} />

        <MetaEventDecklists players={players} fieldSize={event.playerCount} slug={slug} />

        <MetaEventStandings players={players} slug={slug} />

        <p className="text-muted-foreground mt-8 text-sm">
          <Link to="/meta/decks" className="hover:underline">
            Browse every archived deck
          </Link>
        </p>
      </div>
    </div>
  );
}
