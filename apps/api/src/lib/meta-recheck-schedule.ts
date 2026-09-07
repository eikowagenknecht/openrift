const RECHECK_LADDER_DAYS = [1, 3, 7, 30, 90] as const;

const EVENT_DAY_POLL_MS = 60 * 60 * 1000;

const WATCHED_EVENT_DAY_POLL_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

const STALE_EVENT_DAYS = 3;

const COMPLETE = "complete";

export const DECKLIST_PUBLISHED = "PUBLISHED";

export interface MetaRecheckState {
  now: Date;
  checkStage: number;
  displayStatus: string;
  startAt: Date;
  decklistStatus: string | null;
  fetched: boolean;
  decksComplete: boolean;
  playersPending: boolean;
  watched: boolean;
}

export interface MetaRecheckDecision {
  nextCheckAt: Date | null;
  checkStage: number;
  deepFetch: boolean;
}

/** Re-fetches a completed event while its decklists aren't all stored or staged standings are unaccepted. */
export function nextRecheck(state: MetaRecheckState): MetaRecheckDecision {
  const nowMs = state.now.getTime();
  const complete = state.displayStatus === COMPLETE;

  if (!complete) {
    const startMs = state.startAt.getTime();
    if (startMs > nowMs) {
      return { nextCheckAt: new Date(startMs), checkStage: 0, deepFetch: false };
    }
    if (nowMs - startMs < STALE_EVENT_DAYS * DAY_MS) {
      const pollMs = state.watched ? WATCHED_EVENT_DAY_POLL_MS : EVENT_DAY_POLL_MS;
      return { nextCheckAt: new Date(nowMs + pollMs), checkStage: 0, deepFetch: false };
    }
  }

  const deepFetch =
    complete &&
    (!state.fetched ||
      (state.decklistStatus === DECKLIST_PUBLISHED && !state.decksComplete) ||
      state.playersPending);

  const step = Math.max(state.checkStage, 0);
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
