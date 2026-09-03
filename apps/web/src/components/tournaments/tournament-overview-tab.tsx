import type { PodTournamentDetailResponse, TournamentDetailResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  ClipboardCheckIcon,
  InboxIcon,
  ScrollTextIcon,
  SwordsIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  formatPlayerRecord,
  POD_WINS_HINT,
  standingRanks,
} from "@/components/pod-tournaments/standings-display";
import { ParticipantFacepile } from "@/components/tournaments/participant-facepile";
import { ActionBand } from "@/components/ui/action-band";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardList } from "@/components/ui/card-list";
import { IconChip } from "@/components/ui/icon-chip";
import type { PodiumSeat } from "@/components/ui/podium";
import { Podium } from "@/components/ui/podium";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile } from "@/components/ui/stat-tile";
import { UserAvatar } from "@/components/user-avatar";
import { useTournamentDeckCheckEntries } from "@/hooks/use-tournament-deck-check";
import {
  tournamentRunStateQueryOptions,
  useParticipantAction,
  useTournamentParticipants,
} from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import { collapseTeamStandings } from "@/lib/team-display";
import {
  canCheckDecks,
  canManageTournament,
  effectiveTournamentState,
  hasPairing,
  isTournamentStaff,
  pairingLabel,
  pairingPluralNoun,
  STAFF_ROLE_LABEL,
} from "@/lib/tournament-display";
import { cn } from "@/lib/utils";

/** The rail's row shape, shared with the group overview's rail. */
const RAIL_ROW_CLASS = "flex items-center gap-2.5 rounded-md px-2 py-2";

/**
 * Whether the event is over, so a module reads as finished rather than as an
 * open action waiting on the viewer.
 *
 * @returns True once the tournament is completed or cancelled.
 */
function isFinished(detail: TournamentDetailResponse): boolean {
  const state = effectiveTournamentState(detail.startsAt, detail.endsAt, detail.status);
  return state === "completed" || state === "cancelled";
}

/**
 * The Decks tile, split out so the deck-check entries query only runs for
 * viewers who can see the deck-check section. Counts come from the server-side
 * `event` summary so they match the Deck check tab exactly (ADR-033): `approved`
 * is the legality-review stage, `checked` the physical deck check.
 *
 * @returns The Decks tile with the deck total and an approved/checked breakdown.
 */
function DecksTile({ id }: { id: string }) {
  const { data } = useTournamentDeckCheckEntries(id);
  return (
    <StatTile
      render={<Link to="/tournaments/$id/decks" params={{ id }} />}
      icon={ClipboardCheckIcon}
      tone="info"
      label="Decks"
      value={data?.event.entryCount ?? 0}
      hint={`${data?.event.approvedCount ?? 0} approved · ${data?.event.checkedCount ?? 0} checked`}
    />
  );
}

/**
 * What the viewer's own deck is waiting on, as the tile's hint. Only the first
 * two states are the player's move, so only those accent the tile.
 *
 * @returns The hint line, and whether the deck needs the viewer.
 */
function myDeckStatus(
  entry: NonNullable<TournamentDetailResponse["myDeckEntry"]>,
  deckPhase: TournamentDetailResponse["deckPhase"],
): { hint: string; needsViewer: boolean } {
  const windowOpen = deckPhase === "open";
  if (entry.state === "editable" && windowOpen) {
    return { hint: "Not submitted yet — send it in for review.", needsViewer: true };
  }
  if (entry.reviewOutcome === "issue" && entry.state !== "checked") {
    return { hint: "A judge asked for changes.", needsViewer: true };
  }
  if (entry.unlockRequested) {
    return { hint: "Waiting on a judge to unlock it.", needsViewer: false };
  }
  if (entry.state === "withdrawn") {
    return { hint: "The organizer withdrew this entry.", needsViewer: false };
  }
  if (entry.hasPlayerMessage) {
    return { hint: "A judge left you a message.", needsViewer: false };
  }
  return { hint: "View your list.", needsViewer: false };
}

/**
 * The viewer's own deck. The one deck-check surface a plain entrant sees: the
 * Decks tile beside it is the judging queue and stays staff-gated, so without
 * this tile a player has no route to the list they handed in (ADR-033).
 *
 * @returns The My deck tile.
 */
function MyDeckTile({
  id,
  entry,
  deckPhase,
}: {
  id: string;
  entry: NonNullable<TournamentDetailResponse["myDeckEntry"]>;
  deckPhase: TournamentDetailResponse["deckPhase"];
}) {
  const { hint, needsViewer } = myDeckStatus(entry, deckPhase);
  return (
    <StatTile
      render={<Link to="/tournaments/$id/my-deck" params={{ id }} />}
      icon={ScrollTextIcon}
      tone="violet"
      accent={needsViewer}
      label="My deck"
      value={MY_DECK_STATE_LABEL[entry.state]}
      valueClassName="truncate text-lg"
      hint={hint}
    />
  );
}

/** The entry lifecycle as the tile's headline value (ADR-027). */
const MY_DECK_STATE_LABEL: Record<
  NonNullable<TournamentDetailResponse["myDeckEntry"]>["state"],
  string
> = {
  editable: "Not submitted",
  submitted: "Submitted",
  approved: "Approved",
  checked: "Checked",
  withdrawn: "Withdrawn",
};

/**
 * The field, as the main column's wide tile: the headline count with the
 * facepile, and the two facts an organizer chases — who dropped, and who still
 * has no region (region assignment is manager-only, so the second half only
 * shows for viewers who can act on it).
 *
 * @returns The Participants tile.
 */
function ParticipantsTile({
  id,
  detail,
  droppedCount,
  missingRegionCount,
}: {
  id: string;
  detail: TournamentDetailResponse;
  droppedCount: number;
  missingRegionCount: number;
}) {
  const hints = [
    ...(droppedCount > 0 ? [`${droppedCount} dropped`] : []),
    ...(missingRegionCount > 0 ? [`${missingRegionCount} without a region`] : []),
  ];
  // The roster page is staff-only (its route redirects others back here), so
  // the tile is only a link for staff.
  const staff = isTournamentStaff(detail.myRoles);
  return (
    <StatTile
      render={staff ? <Link to="/tournaments/$id/participants" params={{ id }} /> : <div />}
      icon={UsersIcon}
      tone="success"
      label="Participants"
      value={detail.participantCount}
      hint={hints.length > 0 ? hints.join(" · ") : undefined}
    >
      <ParticipantFacepile
        preview={detail.participantPreview}
        totalCount={detail.participantCount}
        size="sm"
      />
    </StatTile>
  );
}

/**
 * The pending join requests, as the band that most needs the viewer. Static
 * (no `render`): the approve/deny rows are real buttons, and a band-wide link
 * around them would nest interactive elements.
 *
 * @returns The join-requests band, or null when nothing is pending.
 */
function JoinRequestsBand({
  id,
  pending,
}: {
  id: string;
  pending: { id: string; displayName: string }[];
}) {
  const participantAction = useParticipantAction();

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // The failure is reported by the global mutation onError toast; swallow
      // the rejection here so the `void run(...)` call sites don't surface it
      // as an uncaught promise.
    }
  }

  if (pending.length === 0) {
    return null;
  }
  return (
    <ActionBand
      icon={InboxIcon}
      accent
      label="Join requests"
      value={pending.length}
      sub={pending.length === 1 ? "wants in" : "want in"}
    >
      <ul className="flex flex-col gap-2">
        {pending.map((participant) => (
          <li
            key={participant.id}
            className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2"
          >
            <span className="truncate text-sm font-medium">{participant.displayName}</span>
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
    </ActionBand>
  );
}

/**
 * The round band's trailing CTA. A span with Button's classes, not a Button:
 * the whole band is the anchor, and a nested interactive element would be
 * invalid HTML. The group-hover overrides re-key the hover styles to the band.
 *
 * @returns The CTA span.
 */
function BandCta({ children, accent }: { children: ReactNode; accent: boolean }) {
  return (
    <span
      className={cn(
        buttonVariants({ variant: accent ? "default" : "ghost" }),
        accent ? "group-hover/action-band:bg-primary/90" : "group-hover/action-band:bg-muted",
      )}
    >
      {children}
      <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
    </span>
  );
}

/**
 * The running round, as the main column's lead band: how much of the round is
 * in, and which pods are still holding it up. Before round 1 exists it becomes
 * the "generate the first round" nudge, and once the event is over it reads as
 * a finished record rather than an open action.
 *
 * @returns The round band.
 */
function RoundBand({
  id,
  detail,
  run,
}: {
  id: string;
  detail: TournamentDetailResponse;
  run: PodTournamentDetailResponse;
}) {
  const manage = canManageTournament(detail.myRoles);
  const finished = isFinished(detail);
  const round = run.rounds.at(-1);
  // Named per pairing, by seat count — the rule the pairings view already uses,
  // so a 1v1 reads as a match on both surfaces.
  const noun = pairingPluralNoun(round?.pods.map((pod) => pod.size) ?? []);

  if (!round) {
    return (
      <ActionBand
        render={<Link to="/tournaments/$id/pairings" params={{ id }} />}
        icon={SwordsIcon}
        accent={manage && !finished}
        label="Rounds"
        value="—"
        sub={finished ? "no rounds were run" : "nothing paired yet"}
        action={
          <BandCta accent={manage && !finished}>
            {manage && !finished ? "Generate round 1" : "View pairings"}
          </BandCta>
        }
      />
    );
  }

  const reported = round.pods.filter((pod) => pod.resultStatus === "reported").length;
  const open = round.pods.filter((pod) => pod.resultStatus !== "reported");
  const needsViewer = manage && !finished && (open.length > 0 || round.status === "finalized");

  return (
    <ActionBand
      render={<Link to="/tournaments/$id/pairings" params={{ id }} />}
      icon={SwordsIcon}
      accent={needsViewer}
      label={`Round ${round.roundNumber}`}
      value={`${reported}/${round.pods.length}`}
      sub={`${noun} reported`}
      action={
        <BandCta accent={needsViewer}>
          {finished ? "View pairings" : open.length > 0 ? "Report results" : "View pairings"}
        </BandCta>
      }
    >
      {open.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {open.map((pod) => {
            const scoresIn = pod.members.filter((member) => member.gamePoints !== null).length;
            return (
              <li
                key={pod.id}
                className="bg-muted text-muted-foreground truncate rounded-lg px-2.5 py-1.5 text-sm"
              >
                <span className="text-foreground font-medium">
                  {pairingLabel(pod.size, pod.podNumber)}
                </span>{" "}
                · {scoresIn} of {pod.members.length} scores in
              </li>
            );
          })}
        </ul>
      ) : null}
    </ActionBand>
  );
}

/**
 * The standings throne: the podium under a header that links through to the
 * full table, with ranks 4-5 as trailing rows so the module stays a standings
 * surface rather than a trophy cabinet.
 *
 * @returns The throne module.
 */
function ThroneModule({
  id,
  run,
  pairingStyle,
  playMode,
}: {
  id: string;
  run: PodTournamentDetailResponse;
  pairingStyle: TournamentDetailResponse["pairingStyle"];
  playMode: TournamentDetailResponse["playMode"];
}) {
  // Standings arrive sorted and tie-broken by the engine. The rank is NOT the
  // row's position: players level on points share one (1, 1, 3), and the rule
  // lives in standingRanks so this throne and the Standings page can never
  // disagree about who is second.
  // 2v2 collapses teammate rows into one seat per team, like the full table.
  const rows = playMode === "2v2" ? collapseTeamStandings(run.standings) : run.standings;
  const played = rows.filter((row) => row.roundsPlayed > 0);
  const ranks = standingRanks(played);
  const ranked = played.map((row, index) => ({ row, rank: ranks[index] ?? index + 1 }));
  const swiss = pairingStyle === "swiss";
  const seats: PodiumSeat[] = ranked.slice(0, 3).map(({ row, rank }) => ({
    key: row.playerId,
    rank,
    name: row.displayName,
    score: row.score,
    hint: formatPlayerRecord(row, swiss),
  }));
  const trailing = ranked.slice(3, 5);
  const finalized = run.rounds.filter((round) => round.status === "finalized").length;

  return (
    <Link
      to="/tournaments/$id/standings"
      params={{ id }}
      className="group/throne block no-underline"
    >
      <Card className="hover:ring-primary/30 p-5 transition-all hover:shadow-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconChip icon={TrophyIcon} tone="gold" size="sm" />
          <SectionHeading>Standings</SectionHeading>
          {finalized > 0 ? (
            <span className="text-muted-foreground/60 truncate text-sm tabular-nums">
              after round {finalized}
            </span>
          ) : null}
          <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-sm">
            Full table
            <ChevronRightIcon className="size-4 transition-transform group-hover/throne:translate-x-0.5" />
          </span>
        </div>
        <Podium seats={seats} emptyLabel="The throne fills after round 1 is finalized." />
        {trailing.length > 0 ? (
          <ul className="flex flex-col">
            {trailing.map(({ row, rank }) => (
              <li key={row.playerId} className={RAIL_ROW_CLASS}>
                <span className="text-muted-foreground w-4 shrink-0 text-center text-sm tabular-nums">
                  {rank}
                </span>
                <UserAvatar name={row.displayName} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.displayName}
                </span>
                <span
                  className="text-muted-foreground shrink-0 text-xs"
                  title={swiss ? undefined : POD_WINS_HINT}
                >
                  {formatPlayerRecord(row, swiss)}
                </span>
                <span className="font-heading w-8 shrink-0 text-right font-semibold tabular-nums">
                  {row.score}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </Link>
  );
}

const ROUND_DOT_CLASS = {
  finalized: "bg-success",
  reporting: "bg-warning",
  next: "bg-muted-foreground/30",
} as const;

/**
 * The rail's rounds list: every round with its status, plus the next round as a
 * dimmed row while one can still be generated — so the rail shows the shape of
 * the whole event, not only what has happened.
 *
 * @returns The rounds section.
 */
function RoundsRail({
  id,
  detail,
  run,
}: {
  id: string;
  detail: TournamentDetailResponse;
  run: PodTournamentDetailResponse;
}) {
  const finished = isFinished(detail);
  const hasOpenRound = run.rounds.some((round) => round.status === "reporting");
  const showNext = !finished && !hasOpenRound;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Rounds</SectionHeading>
      <CardList>
        {run.rounds.map((round) => (
          <li key={round.id}>
            <Link
              to="/tournaments/$id/pairings"
              params={{ id }}
              className={cn(RAIL_ROW_CLASS, "hover:bg-muted/50")}
            >
              <span
                className={cn("size-2 shrink-0 rounded-full", ROUND_DOT_CLASS[round.status])}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                Round {round.roundNumber}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {round.status === "finalized" ? "Finalized" : "Reporting"}
              </span>
            </Link>
          </li>
        ))}
        {showNext ? (
          <li className={cn(RAIL_ROW_CLASS, "opacity-60")}>
            <span
              className={cn("size-2 shrink-0 rounded-full", ROUND_DOT_CLASS.next)}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              Round {run.rounds.length + 1}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">Not generated</span>
          </li>
        ) : null}
        {run.rounds.length === 0 && !showNext ? (
          <li className={cn(RAIL_ROW_CLASS, "text-muted-foreground text-sm")}>
            No rounds were run.
          </li>
        ) : null}
      </CardList>
    </section>
  );
}

/**
 * The rail's staff list. Manager-only: `detail.staff` is populated for every
 * viewer, but who judges an event is organizer context, not public billing.
 *
 * @returns The staff section.
 */
function StaffRail({ id, detail }: { id: string; detail: TournamentDetailResponse }) {
  const hasJudges = detail.staff.some((member) => member.role === "judge");
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Staff</SectionHeading>
      <CardList>
        {detail.staff.map((member) => (
          <li key={`${member.userId}:${member.role}`} className={RAIL_ROW_CLASS}>
            <UserAvatar name={member.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {member.name ?? "Unnamed"}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {STAFF_ROLE_LABEL[member.role]}
            </span>
          </li>
        ))}
        {hasJudges ? null : (
          <li className={cn(RAIL_ROW_CLASS, "text-muted-foreground text-sm")}>
            <span className="min-w-0 flex-1">No judges yet.</span>
            <Link
              to="/tournaments/$id/staff"
              params={{ id }}
              className="text-primary shrink-0 text-sm font-medium hover:underline"
            >
              Add
            </Link>
          </li>
        )}
      </CardList>
    </section>
  );
}

/**
 * The round band, throne, and rounds rail, split out so the pod-engine
 * run-state query only runs for tournaments that actually pair rounds.
 *
 * @returns The round-driven modules for the given slot.
 */
function RunStateModules({
  id,
  detail,
  slot,
}: {
  id: string;
  detail: TournamentDetailResponse;
  slot: "main" | "rail";
}) {
  const userId = useRequiredUserId();
  const { data } = useQuery(tournamentRunStateQueryOptions(userId, id));

  if (!data) {
    return null;
  }
  if (slot === "rail") {
    return <RoundsRail id={id} detail={detail} run={data} />;
  }
  return (
    <>
      <RoundBand id={id} detail={detail} run={data} />
      <ThroneModule
        id={id}
        run={data}
        pairingStyle={detail.pairingStyle}
        playMode={detail.playMode}
      />
    </>
  );
}

/**
 * The tournament overview / dashboard: the join requests and the running round
 * lead the main column, the standings throne sits under them, and the field and
 * decks close it out, with the rounds and staff as the rail's context.
 *
 * The participant roster is staff-gated on the API (it carries the claim
 * links), so only the staff variant subscribes to it; a plain participant gets
 * the same dashboard without the roster-derived hints.
 *
 * @returns The overview-page content.
 */
export function TournamentOverviewTab({
  id,
  detail,
}: {
  id: string;
  detail: TournamentDetailResponse;
}) {
  if (isTournamentStaff(detail.myRoles)) {
    return <StaffOverviewTab id={id} detail={detail} />;
  }
  return (
    <OverviewTabBody id={id} detail={detail} pending={[]} droppedCount={0} missingRegionCount={0} />
  );
}

/** @returns The overview with the staff-only roster hints resolved. */
function StaffOverviewTab({ id, detail }: { id: string; detail: TournamentDetailResponse }) {
  const manage = canManageTournament(detail.myRoles);
  const { data: participants } = useTournamentParticipants(id);

  const pending = participants.items.filter((p) => p.status === "requested");
  const droppedCount = participants.items.filter((p) => p.status === "dropped").length;
  // Region assignment is a manager action, so the gap is only worth naming to
  // someone who can close it.
  const missingRegionCount =
    manage && detail.regionsEnabled
      ? participants.items.filter((p) => p.status === "active" && p.region === null).length
      : 0;

  return (
    <OverviewTabBody
      id={id}
      detail={detail}
      pending={pending}
      droppedCount={droppedCount}
      missingRegionCount={missingRegionCount}
    />
  );
}

/** @returns The overview layout, shared by the staff and participant variants. */
function OverviewTabBody({
  id,
  detail,
  pending,
  droppedCount,
  missingRegionCount,
}: {
  id: string;
  detail: TournamentDetailResponse;
  pending: { id: string; displayName: string }[];
  droppedCount: number;
  missingRegionCount: number;
}) {
  const manage = canManageTournament(detail.myRoles);
  const runsRounds = hasPairing(detail.pairingStyle);
  const showDecks = detail.deckSubmission !== "none" && canCheckDecks(detail.myRoles);
  const myDeck = detail.myDeckEntry;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {manage ? <JoinRequestsBand id={id} pending={pending} /> : null}
        {runsRounds ? <RunStateModules id={id} detail={detail} slot="main" /> : null}
        <div className={cn("grid gap-4", (showDecks || myDeck) && "sm:grid-cols-2")}>
          <ParticipantsTile
            id={id}
            detail={detail}
            droppedCount={droppedCount}
            missingRegionCount={missingRegionCount}
          />
          {showDecks ? <DecksTile id={id} /> : null}
          {myDeck ? <MyDeckTile id={id} entry={myDeck} deckPhase={detail.deckPhase} /> : null}
        </div>
      </div>
      <aside className="flex flex-col gap-8">
        {runsRounds ? <RunStateModules id={id} detail={detail} slot="rail" /> : null}
        {manage ? <StaffRail id={id} detail={detail} /> : null}
      </aside>
    </div>
  );
}
