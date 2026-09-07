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

const RAIL_ROW_CLASS = "flex items-center gap-2.5 rounded-md px-2 py-2";

function isFinished(detail: TournamentDetailResponse): boolean {
  const state = effectiveTournamentState(detail.startsAt, detail.endsAt, detail.status);
  return state === "completed" || state === "cancelled";
}

/** Counts come from the server-side `event` summary so they match the Deck check tab exactly. */
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

/** Only the first two states are the player's move, so only those accent the tile. */
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

/** The one deck-check surface a plain entrant sees; the Decks tile beside it stays staff-gated. */
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

/** No `render`: the approve/deny rows are real buttons, and a band-wide link would nest interactive elements. */
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
      // Reported by the global mutation onError toast; swallowed so the
      // `void run(...)` call sites don't surface it as an uncaught promise.
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

/** A span with Button's classes, not a Button: the whole band is the anchor, and a nested interactive element would be invalid HTML. */
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
  // Rank is not row position: players level on points share one (1, 1, 3);
  // the rule lives in standingRanks so this throne and the Standings page agree.
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

/** `detail.staff` is populated for every viewer; who judges an event is organizer context, not public. */
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

/** Split out so the pod-engine run-state query only runs for tournaments that actually pair rounds. */
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
 * The participant roster is staff-gated on the API, so only the staff variant
 * subscribes to it; a plain participant gets the dashboard without the roster-derived hints.
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

function StaffOverviewTab({ id, detail }: { id: string; detail: TournamentDetailResponse }) {
  const manage = canManageTournament(detail.myRoles);
  const { data: participants } = useTournamentParticipants(id);

  const pending = participants.items.filter((p) => p.status === "requested");
  const droppedCount = participants.items.filter((p) => p.status === "dropped").length;
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
