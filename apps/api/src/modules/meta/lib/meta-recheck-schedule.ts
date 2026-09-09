import type { MetaEventStatus } from "@openrift/shared/types/enums";

const RECHECK_LADDER_DAYS = [1, 3, 7, 30, 90] as const;

const EVENT_DAY_POLL_MS = 60 * 60 * 1000;

const WATCHED_EVENT_DAY_POLL_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export const STALE_EVENT_DAYS = 3;

const COMPLETE = "complete";

const IN_PROGRESS = "inProgress";

export const DECKLIST_PUBLISHED = "PUBLISHED";

export interface MetaLifecycleState {
  now: Date;
  displayStatus: string;
  startAt: Date;
}

export interface MetaRecheckState extends MetaLifecycleState {
  checkStage: number;
  decklistStatus: string | null;
  fetched: boolean;
  decksComplete: boolean;
  playersPending: boolean;
  newRounds: boolean;
  watched: boolean;
}

export interface MetaRecheckDecision {
  nextCheckAt: Date | null;
  checkStage: number;
  deepFetch: boolean;
}

function isStale(state: MetaLifecycleState): boolean {
  return state.now.getTime() - state.startAt.getTime() >= STALE_EVENT_DAYS * DAY_MS;
}

/** A stale unfinished event (see {@link STALE_EVENT_DAYS}) reads as complete. */
export function lifecycleStatus(state: MetaLifecycleState): MetaEventStatus {
  if (state.displayStatus === COMPLETE) {
    return "complete";
  }
  if (state.startAt.getTime() > state.now.getTime()) {
    return "upcoming";
  }
  if (isStale(state)) {
    return "complete";
  }
  return state.displayStatus === IN_PROGRESS ? "in_progress" : "upcoming";
}

/**
 * Re-fetches a running event each time the source finishes a round, and a
 * completed one while its decklists or staged standings are unaccepted.
 */
export function nextRecheck(state: MetaRecheckState): MetaRecheckDecision {
  const nowMs = state.now.getTime();
  const complete = state.displayStatus === COMPLETE;

  if (!complete) {
    const startMs = state.startAt.getTime();
    if (startMs > nowMs) {
      return { nextCheckAt: new Date(startMs), checkStage: 0, deepFetch: false };
    }
    if (!isStale(state)) {
      const pollMs = state.watched ? WATCHED_EVENT_DAY_POLL_MS : EVENT_DAY_POLL_MS;
      return { nextCheckAt: new Date(nowMs + pollMs), checkStage: 0, deepFetch: state.newRounds };
    }
  }

  const step = Math.max(state.checkStage, 0);
  // Stage 0 on a complete event is the first visit since it finished: the
  // final standings supersede whatever a mid-event fetch stored.
  const deepFetch =
    complete &&
    (step === 0 ||
      !state.fetched ||
      (state.decklistStatus === DECKLIST_PUBLISHED && !state.decksComplete) ||
      state.playersPending);

  const ladderDays = RECHECK_LADDER_DAYS[step];
  if (ladderDays === undefined) {
    return { nextCheckAt: null, checkStage: step, deepFetch };
  }
  return {
    nextCheckAt: new Date(nowMs + ladderDays * DAY_MS),
    checkStage: step + 1,
    deepFetch,
  };
}
