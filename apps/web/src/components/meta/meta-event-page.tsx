import type { MetaEventDetail } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";
import { EllipsisVerticalIcon, MessageSquareWarningIcon } from "lucide-react";
import { useState } from "react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarIconButton,
  PageTopBarSticky,
} from "@/components/layout/page-top-bar";
import { TopBarBreadcrumbTrail } from "@/components/layout/top-bar-breadcrumb";
import { MarkdownText } from "@/components/markdown-text";
import { MetaEventBracket } from "@/components/meta/meta-event-bracket";
import { MetaEventContributeBand } from "@/components/meta/meta-event-contribute-band";
import { MetaEventCorrectionDialog } from "@/components/meta/meta-event-correction-dialog";
import { MetaEventHeader } from "@/components/meta/meta-event-header";
import { MetaEventLegendFinishes } from "@/components/meta/meta-event-legend-finishes";
import { MetaEventStandings } from "@/components/meta/meta-event-standings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMetaEvent } from "@/hooks/use-meta";
import { useUserId } from "@/lib/auth-session";
import { cn, PAGE_WIDTH } from "@/lib/utils";

function EventActionsMenu({ event }: { event: MetaEventDetail }) {
  const userId = useUserId();
  const [correcting, setCorrecting] = useState(false);

  if (userId === null) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<PageTopBarIconButton />}>
          <EllipsisVerticalIcon className="size-4" />
          <span className="sr-only">Tournament actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCorrecting(true)}>
            <MessageSquareWarningIcon className="size-4" />
            Suggest a correction
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {correcting && (
        <MetaEventCorrectionDialog event={event} onClose={() => setCorrecting(false)} />
      )}
    </>
  );
}

export function MetaEventPage({ slug }: { slug: string }) {
  const { data } = useMetaEvent(slug);
  const { event, players, matches, phases } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TopBarBreadcrumbTrail
              segments={[
                { label: "Meta Archive", link: <Link to="/meta" /> },
                { label: event.name },
              ]}
            />
          </div>
          <PageTopBarActions>
            <EventActionsMenu event={event} />
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-10")}>
        <MetaEventHeader
          event={event}
          players={players}
          matches={matches}
          phases={phases}
          slug={slug}
        />

        {event.notes !== null && event.notes !== "" && (
          <div className="mt-4">
            {/* Admin-curated copy, so any http(s) host in it is linkable. */}
            <MarkdownText text={event.notes} links="any" />
          </div>
        )}

        <MetaEventBracket matches={matches} phases={phases} players={players} />

        <MetaEventLegendFinishes players={players} />

        <MetaEventStandings
          players={players}
          matches={matches}
          phases={phases}
          slug={slug}
          eventDate={event.eventDate}
        />

        <div className="mt-8">
          <MetaEventContributeBand event={event} players={players} slug={slug} />
        </div>

        <p className="text-muted-foreground mt-8 text-sm">
          <Link to="/meta/decks" className="hover:underline">
            Browse every archived deck
          </Link>
        </p>
      </div>
    </div>
  );
}
