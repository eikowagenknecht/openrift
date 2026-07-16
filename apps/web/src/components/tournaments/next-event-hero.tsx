import type { TournamentParticipantPreview, TournamentSummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CalendarIcon, LayersIcon, TrophyIcon } from "lucide-react";

import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
import { CoverBand } from "@/components/cover-band";
import { Eyebrow, Heading } from "@/components/heading";
import { ParticipantFacepile } from "@/components/tournaments/participant-facepile";
import { Badge } from "@/components/ui/badge";
import { CardLink } from "@/components/ui/card-link";
import { DateLeaf } from "@/components/ui/date-leaf";
import { UserAvatar } from "@/components/user-avatar";
import { useDeckFormatList } from "@/hooks/use-enums";
import {
  VIEWER_ROLE_LABEL,
  dateLeafParts,
  effectiveTournamentState,
  formatStartsIn,
  formatTournamentDate,
  primaryViewerRole,
} from "@/lib/tournament-display";

// Loose organic spread for the avatar-cluster band (percent offsets from the
// band's top-left), indexed to the facepile preview order.
const CLUSTER_SPOTS = [
  { left: "50%", top: "40%", size: "lg" },
  { left: "31%", top: "28%", size: "default" },
  { left: "68%", top: "54%", size: "default" },
  { left: "25%", top: "64%", size: "sm" },
  { left: "73%", top: "26%", size: "sm" },
] as const;

/**
 * The people variant of the hero band: participant avatars loosely clustered
 * on the glow, for events that never collect decks.
 *
 * @returns The cluster elements (host must be relative).
 */
function HeroAvatarCluster({
  preview,
  totalCount,
}: {
  preview: TournamentParticipantPreview[];
  totalCount: number;
}) {
  const shown = preview.slice(0, CLUSTER_SPOTS.length);
  const overflow = totalCount - shown.length;
  return (
    <>
      {shown.map((participant, index) => {
        const spot = CLUSTER_SPOTS[index];
        return (
          <span
            key={`${participant.name}-${index}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: spot.left, top: spot.top }}
          >
            <UserAvatar
              name={participant.name}
              image={participant.image}
              gravatarHash={participant.gravatarHash}
              size={spot.size}
            />
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className="bg-muted text-muted-foreground absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-medium"
          style={{ left: "58%", top: "74%" }}
        >
          +{overflow}
        </span>
      )}
    </>
  );
}

/**
 * The hero's band content, by the fallback ladder: submitted legend art →
 * dashed fan (deck submission on, nothing in yet) → participant avatar
 * cluster → a quiet trophy emblem. The dashed fan is reserved for events that
 * actually collect decks, so nothing reads as "missing" on ones that don't.
 *
 * @returns The band content.
 */
function HeroBandContent({ tournament }: { tournament: TournamentSummaryResponse }) {
  if (tournament.coverLegends.length > 0) {
    return (
      <CardFan
        covers={tournament.coverLegends.map((legend) => ({
          key: legend.printingId,
          imageId: legend.imageId,
        }))}
        size="lg"
        anchor="center"
      />
    );
  }
  if (tournament.deckSubmission !== "none") {
    return <CardFanOutline size="lg" anchor="center" icon={LayersIcon} />;
  }
  if (tournament.participantPreview.length > 0) {
    return (
      <HeroAvatarCluster
        preview={tournament.participantPreview}
        totalCount={tournament.participantCount}
      />
    );
  }
  return (
    <span className="text-border-accent absolute inset-0 flex items-center justify-center opacity-60">
      <TrophyIcon className="size-10" />
    </span>
  );
}

/**
 * @returns The event's hosting context label: its group, or its org host.
 * Null for a plain user-hosted event with no group.
 */
function contextLabel(tournament: TournamentSummaryResponse): string | null {
  if (tournament.groupName) {
    return tournament.groupName;
  }
  return tournament.host.type === "organization" ? tournament.host.displayName : null;
}

interface NextEventHeroProps {
  tournament: TournamentSummaryResponse;
  /** Label the event with its group / org host (the cross-group personal list). */
  showContext?: boolean;
}

/**
 * The events hero: the next (or live) tournament as a large tile with a
 * date leaf, countdown, facepile, and a card-art band. The whole tile links to
 * the tournament page.
 *
 * @returns The hero tile.
 */
export function NextEventHero({ tournament, showContext = false }: NextEventHeroProps) {
  const { labels: formatLabels } = useDeckFormatList();
  const state = effectiveTournamentState(tournament.startsAt, tournament.endsAt, tournament.status);
  const live = state === "in_progress";
  const startsIn = formatStartsIn(tournament.startsAt);
  const leaf = dateLeafParts(tournament.startsAt);
  const role = primaryViewerRole(tournament.myRoles);
  return (
    <CardLink
      render={<Link to="/tournaments/$id" params={{ id: tournament.id }} />}
      className="gap-0 overflow-hidden py-0 sm:flex-row-reverse"
    >
      <CoverBand
        aria-hidden="true"
        className="h-40 w-full overflow-hidden sm:h-auto sm:min-h-52 sm:w-72"
      >
        <HeroBandContent tournament={tournament} />
      </CoverBand>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <Eyebrow className="text-primary text-2xs mb-0 tracking-widest">
          {live ? "Happening now" : "Next event"}
        </Eyebrow>
        <div className="flex min-w-0 items-center gap-3.5">
          <DateLeaf month={leaf.month} day={leaf.day} />
          <div className="min-w-0">
            <Heading level={2} as="h3" className="truncate">
              {tournament.name}
            </Heading>
            <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm">
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="size-4 shrink-0" />
                {formatTournamentDate(tournament.startsAt)}
              </span>
              {tournament.deckFormat ? (
                <span className="flex items-center gap-1.5">
                  <LayersIcon className="size-4 shrink-0" />
                  {formatLabels[tournament.deckFormat]}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {live ? (
            <Badge variant="subtle">Live</Badge>
          ) : startsIn ? (
            <Badge variant="subtle">{startsIn}</Badge>
          ) : null}
          {role ? <Badge variant="outline">{VIEWER_ROLE_LABEL[role]}</Badge> : null}
          {showContext && contextLabel(tournament) ? (
            <Badge variant="outline">{contextLabel(tournament)}</Badge>
          ) : null}
          {tournament.pendingRequestCount > 0 ? (
            <Badge variant="warning">
              {tournament.pendingRequestCount} pending request
              {tournament.pendingRequestCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        {tournament.participantCount > 0 ? (
          <div className="text-muted-foreground mt-auto flex items-center gap-2.5 pt-1 text-sm">
            <ParticipantFacepile
              preview={tournament.participantPreview}
              totalCount={tournament.participantCount}
              size="sm"
            />
            {tournament.participantCount} participant
            {tournament.participantCount === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </CardLink>
  );
}
