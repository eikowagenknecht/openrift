import type { TournamentDetailResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2Icon,
  CalendarIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  DoorOpenIcon,
  InboxIcon,
  LockIcon,
  ShieldIcon,
  SwordsIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTournamentDeckCheckEntries } from "@/hooks/use-tournament-deck-check";
import {
  tournamentRunStateQueryOptions,
  useParticipantAction,
  useTournamentParticipants,
} from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import {
  canCheckDecks,
  canManageTournament,
  DECK_SUBMISSION_LABEL,
  formatTournamentDate,
} from "@/lib/tournament-display";
import { cn } from "@/lib/utils";

type TournamentTileTarget =
  | "/tournaments/$id/participants"
  | "/tournaments/$id/pairings"
  | "/tournaments/$id/standings"
  | "/tournaments/$id/decks"
  | "/tournaments/$id/staff";

/**
 * A dashboard tile linking to one of the tournament sections: a tinted icon
 * chip, a label, the stat value, an optional hint, and a chevron that slides in
 * on hover. `accent` gives the gold treatment to the tile that needs attention.
 * @returns The tile.
 */
function StatCard({
  to,
  id,
  icon: Icon,
  label,
  value,
  valueClassName,
  accent = false,
  hint,
}: {
  to: TournamentTileTarget;
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  accent?: boolean;
  hint?: ReactNode;
}): ReactNode {
  return (
    <Link
      to={to}
      params={{ id }}
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl border p-5 transition-all hover:shadow-md sm:min-h-28",
        accent
          ? "border-primary/30 bg-primary/5 hover:border-primary/50"
          : "bg-card hover:border-primary/30 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="text-muted-foreground shrink-0 text-sm font-medium">{label}</span>
        <span className={cn("ml-auto min-w-0 text-3xl font-semibold tabular-nums", valueClassName)}>
          {value}
        </span>
        <ChevronRightIcon className="text-muted-foreground/40 group-hover:text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </div>
      {hint ? <span className="text-muted-foreground mt-auto text-xs">{hint}</span> : null}
    </Link>
  );
}

/**
 * The Decks tile, split out so the deck-check entries query only runs for
 * viewers who can see the deck-check section. Counts come from the server-side
 * `event` summary so they match the Deck check tab exactly (ADR-033): `approved`
 * is the legality-review stage, `checked` the physical deck check.
 * @returns The Decks tile with the deck total and an approved/checked breakdown.
 */
function DecksTile({ id }: { id: string }) {
  const { data } = useTournamentDeckCheckEntries(id);
  return (
    <StatCard
      to="/tournaments/$id/decks"
      id={id}
      icon={ClipboardCheckIcon}
      label="Decks"
      value={data?.event.entryCount ?? 0}
      hint={`${data?.event.approvedCount ?? 0} approved · ${data?.event.checkedCount ?? 0} checked`}
    />
  );
}

/**
 * The Standings tile, split out so the pod-engine query only runs for pod
 * tournaments. Names the current leader once at least one round has been
 * played; before then there is no ranking to show.
 * @returns The Standings tile naming the current leader.
 */
function StandingsTile({ id }: { id: string }) {
  const userId = useRequiredUserId();
  const { data } = useQuery(tournamentRunStateQueryOptions(userId, id));
  const leader = data?.standings[0];
  const hasResults = leader !== undefined && leader.roundsPlayed > 0;
  return (
    <StatCard
      to="/tournaments/$id/standings"
      id={id}
      icon={TrophyIcon}
      label="Standings"
      value={hasResults ? leader.displayName : "—"}
      valueClassName={hasResults ? "truncate text-lg" : undefined}
      hint={hasResults ? "leader" : "no results yet"}
    />
  );
}

function DashboardTiles({
  id,
  detail,
  pendingCount,
}: {
  id: string;
  detail: TournamentDetailResponse;
  pendingCount: number;
}) {
  const manage = canManageTournament(detail.myRoles);
  const isPod = detail.pairingStyle === "pod";
  const showDecks = detail.deckSubmission !== "none" && canCheckDecks(detail.myRoles);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard
        to="/tournaments/$id/participants"
        id={id}
        icon={UsersIcon}
        label="Participants"
        value={detail.participantCount}
        accent={pendingCount > 0}
        hint={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? "request" : "requests"} to review`
            : undefined
        }
      />
      {isPod ? (
        <StatCard
          to="/tournaments/$id/pairings"
          id={id}
          icon={SwordsIcon}
          label="Pairings"
          value={detail.currentRound > 0 ? detail.currentRound : "—"}
          hint={detail.currentRound > 0 ? "current round" : "not started yet"}
        />
      ) : null}
      {isPod ? <StandingsTile id={id} /> : null}
      {showDecks ? <DecksTile id={id} /> : null}
      {manage ? (
        <StatCard
          to="/tournaments/$id/staff"
          id={id}
          icon={ShieldIcon}
          label="Staff"
          value={detail.staff.length}
          hint="organizers and judges"
        />
      ) : null}
    </div>
  );
}

/**
 * One fact in the header meta-line: an icon and its value, rendered inline and
 * muted so the row reads as event context rather than primary content.
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
 * One policy fact inside the shared details card: an icon chip matching the
 * dashboard tiles, the setting label, and its value pushed to the right.
 * @returns The policy row.
 */
function PolicyRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-5" />
      </span>
      <span className="text-muted-foreground shrink-0 text-sm font-medium">{label}</span>
      <span className="ml-auto font-medium">{value}</span>
    </div>
  );
}

export function TournamentOverviewTab({
  id,
  detail,
}: {
  id: string;
  detail: TournamentDetailResponse;
}) {
  const manage = canManageTournament(detail.myRoles);
  const { data: participants } = useTournamentParticipants(id);
  const participantAction = useParticipantAction();
  const pending = participants.items.filter((p) => p.status === "requested");

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
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

        <DashboardTiles id={id} detail={detail} pendingCount={pending.length} />
      </div>

      <section className="bg-card grid gap-x-8 gap-y-3 rounded-xl border p-5 sm:grid-cols-2">
        <PolicyRow
          icon={InboxIcon}
          label="Deck submission"
          value={DECK_SUBMISSION_LABEL[detail.deckSubmission]}
        />
        <PolicyRow
          icon={detail.selfRegistration ? DoorOpenIcon : LockIcon}
          label="Self-registration"
          value={detail.selfRegistration ? "Open" : "Closed"}
        />
      </section>

      {manage ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">
            Join requests
            {pending.length > 0 ? (
              <Badge variant="count" className="ml-2">
                {pending.length}
              </Badge>
            ) : null}
          </h2>
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending requests.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((participant) => (
                <li
                  key={participant.id}
                  className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{participant.displayName}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      size="sm"
                      disabled={participantAction.isPending}
                      onClick={() =>
                        void run(() =>
                          participantAction.mutateAsync({
                            id,
                            participantId: participant.id,
                            action: "approve",
                          }),
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={participantAction.isPending}
                      onClick={() =>
                        void run(() =>
                          participantAction.mutateAsync({
                            id,
                            participantId: participant.id,
                            action: "deny",
                          }),
                        )
                      }
                    >
                      Deny
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
