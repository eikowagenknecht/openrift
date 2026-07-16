import type { TournamentDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { Building2Icon, CalendarIcon, UsersIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Eyebrow, Heading } from "@/components/heading";
import { HeroAvatarCluster } from "@/components/tournaments/hero-avatar-cluster";
import { Badge } from "@/components/ui/badge";
import {
  DECK_SUBMISSION_LABEL,
  EFFECTIVE_STATE_LABEL,
  effectiveTournamentState,
  formatTournamentDate,
} from "@/lib/tournament-display";

// The band's backdrop, bottom layer up: a soft surface tint fading into the
// page background, a faint violet under-tone, and the warm accent glow rising
// toward the avatar cluster — the same wash the group hero carries, so the two
// overview surfaces read as siblings. Token-based so both themes keep it.
const HERO_WASH = [
  "radial-gradient(90% 130% at 85% 10%, color-mix(in oklab, var(--border-accent) 26%, transparent), transparent 62%)",
  "radial-gradient(70% 120% at 65% 100%, color-mix(in oklab, oklch(0.5 0.11 300) 14%, transparent), transparent 65%)",
  "linear-gradient(color-mix(in oklab, var(--muted) 50%, var(--background)), var(--background))",
].join(", ");

/**
 * The kicker over the tournament name: what kind of event this is, then where
 * it stands. A live event reads "Live" rather than the lifecycle's own "In
 * progress", which is the label a list needs, not a page the viewer is on.
 *
 * @returns The kicker text, e.g. `Pod tournament · Live`.
 */
function heroKicker(detail: TournamentDetailResponse): string {
  const kind =
    detail.pairingStyle === "pod"
      ? "Pod tournament"
      : detail.pairingStyle === "swiss"
        ? "Swiss tournament"
        : "Tournament";
  const state = effectiveTournamentState(detail.startsAt, detail.endsAt, detail.status);
  return `${kind} · ${state === "in_progress" ? "Live" : EFFECTIVE_STATE_LABEL[state]}`;
}

/**
 * One fact in the hero's meta-line: an icon and its value, rendered inline and
 * muted so the row reads as event context rather than primary content.
 *
 * @returns The meta item.
 */
function MetaItem({
  icon: Icon,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
}): ReactNode {
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5">
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * The tournament overview's identity band: a borderless, square-cornered hero
 * bounded to the content column, carrying the page title (the top bar above it
 * keeps only the breadcrumb — this band is the title row), the event's meta
 * line, and the setup facts as chips. Deliberately compact: no facepile, since
 * the Participants tile below shows the field. On `sm`+, the participant avatar
 * cluster sits decoratively on the glow.
 *
 * @returns The hero band element.
 */
export function TournamentHero({ detail }: { detail: TournamentDetailResponse }) {
  const state = effectiveTournamentState(detail.startsAt, detail.endsAt, detail.status);

  return (
    <div className="px-safe pt-4">
      {/* The wash lives on the column-bounded box (square corners, no ring), so
          it ends where the content ends instead of smearing across ultra-wide
          viewports. */}
      <section
        className="relative mx-auto w-full max-w-5xl overflow-hidden"
        style={{ backgroundImage: HERO_WASH }}
      >
        <div className="flex items-end gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 py-6 pl-5">
            <Eyebrow variant="kicker">{heroKicker(detail)}</Eyebrow>
            <Heading level={1} className="text-3xl text-balance">
              {detail.name}
            </Heading>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <MetaItem icon={CalendarIcon}>{formatTournamentDate(detail.startsAt)}</MetaItem>
              <MetaItem icon={Building2Icon}>
                {detail.host.type === "organization" && detail.host.orgSlug ? (
                  <Link
                    to="/organizations/$id"
                    params={{ id: detail.host.orgId ?? "" }}
                    className="hover:underline"
                  >
                    {detail.host.displayName}
                  </Link>
                ) : (
                  detail.host.displayName
                )}
              </MetaItem>
              {detail.groupSlug ? (
                <MetaItem icon={UsersIcon}>
                  <Link
                    to="/groups/$slug"
                    params={{ slug: detail.groupSlug }}
                    className="hover:underline"
                  >
                    {detail.groupName ?? detail.groupSlug}
                  </Link>
                </MetaItem>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {/* The round badge is the live fact; the state badge (moved here
                  from the top bar) is where the event stands overall. */}
              {detail.currentRound > 0 ? (
                <Badge variant="subtle">Round {detail.currentRound}</Badge>
              ) : null}
              <Badge variant="secondary">{EFFECTIVE_STATE_LABEL[state]}</Badge>
              <Badge variant="outline">{DECK_SUBMISSION_LABEL[detail.deckSubmission]}</Badge>
              <Badge variant="outline">
                {detail.selfRegistration ? "Registration open" : "Registration closed"}
              </Badge>
            </div>
          </div>
          <div aria-hidden="true" className="relative hidden h-36 w-72 shrink-0 self-end sm:block">
            <HeroAvatarCluster
              preview={detail.participantPreview}
              totalCount={detail.participantCount}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
