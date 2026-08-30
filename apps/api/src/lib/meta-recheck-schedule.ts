/**
 * When to look at an accepted event again, and whether this visit should pull
 * its results (ADR-014, "Catalogue sync").
 *
 * Only accepted events are ever in the queue, and every visit costs exactly one
 * listing request. The shape of the ladder follows what actually changes: an
 * event that has started is polled while it runs — every quarter hour on a
 * watched template, hourly otherwise — because standings finalize within the
 * hour of the final, and a completed one is revisited on a decaying schedule
 * because the only late change left is an organizer publishing decklists.
 */

/** Days after completion the decaying rechecks land on. */
const RECHECK_LADDER_DAYS = [1, 3, 7, 30, 90] as const;

/** How often an event that has started but not finished is re-read. */
const EVENT_DAY_POLL_MS = 60 * 60 * 1000;

/** The live poll for an event on a watched template, where minutes matter. */
const WATCHED_EVENT_DAY_POLL_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The source's own status vocabulary; only `complete` ends the event-day poll. */
const COMPLETE = "complete";

/** The `decklist_status` that makes an event's individual decks readable. */
export const DECKLIST_PUBLISHED = "PUBLISHED";

export interface MetaRecheckState {
  now: Date;
  /** How far through the ladder the row is. 0 means "accepted, not completed yet". */
  checkStage: number;
  displayStatus: string;
  startAt: Date;
  decklistStatus: string | null;
  /** Whether a deep fetch has ever landed for this event. */
  fetched: boolean;
  /** Whether every referenced decklist is stored, or recorded as refused. */
  decksComplete: boolean;
  /**
   * Whether staged standings rows are still waiting to be accepted to the live
   * event — a fetch whose accept loop died partway leaves these behind.
   */
  playersPending: boolean;
  /** Whether the event runs a template an admin is watching. */
  watched: boolean;
}

export interface MetaRecheckDecision {
  /** Null once the ladder is exhausted: the row leaves the queue for good. */
  nextCheckAt: Date | null;
  checkStage: number;
  /** Whether this visit should run the deep fetch. */
  deepFetch: boolean;
}

/**
 * The next visit for one due row.
 *
 * A completed event is fetched when nothing has been fetched yet, again while
 * its published decklists are not all stored — the whole reason the ladder
 * reaches 90 days, since the daily sync ages out of the event long before a
 * slow organizer publishes, and a field past the per-pass deck cap needs the
 * later steps to finish — and again while staged standings rows are still
 * waiting on their accept, so an interrupted accept loop is retried rather
 * than left half-published forever.
 */
export function nextRecheck(state: MetaRecheckState): MetaRecheckDecision {
  const nowMs = state.now.getTime();

  if (state.displayStatus !== COMPLETE) {
    // Before the start time there is nothing to see, so the next visit is the
    // start itself; after it, polling until the source calls the event done —
    // every quarter hour for a watched event, hourly otherwise.
    const startMs = state.startAt.getTime();
    const pollMs = state.watched ? WATCHED_EVENT_DAY_POLL_MS : EVENT_DAY_POLL_MS;
    const nextMs = startMs > nowMs ? startMs : nowMs + pollMs;
    return { nextCheckAt: new Date(nextMs), checkStage: 0, deepFetch: false };
  }

  const deepFetch =
    !state.fetched ||
    (state.decklistStatus === DECKLIST_PUBLISHED && !state.decksComplete) ||
    state.playersPending;

  const step = Math.max(state.checkStage, 0);
  if (step >= RECHECK_LADDER_DAYS.length) {
    return { nextCheckAt: null, checkStage: step, deepFetch };
  }
  return {
    nextCheckAt: new Date(nowMs + RECHECK_LADDER_DAYS[step] * DAY_MS),
    checkStage: step + 1,
    deepFetch,
  };
}
