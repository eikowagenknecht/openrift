/**
 * Ingest one signed-in user's decklist submission to the meta archive.
 *
 * A submission is not an upload: `ingestMetaCandidates` replaces every standings
 * row of each event it names, and all submissions share one provider, so a
 * batch ingest of one list would wipe every other person's pending
 * contribution. This inserts exactly one candidate row under a per-submission
 * external id and deletes nothing. Everything downstream — the review queue, accept, the
 * ignore lists — is the machinery that already exists.
 *
 * Two things are worth knowing about the shape:
 *
 *   - A submission against an event the archive already has hangs its candidate
 *     row off that *live* event, so no placeholder candidate event is invented
 *     for it. `candidate_meta_players` has a CHECK for exactly that.
 *   - A submission that proposes an event the archive does not have needs
 *     somewhere for the row to hang, and the same CHECK leaves one option: a
 *     real candidate event under this provider, carrying the fields the person
 *     typed. It is a proposal in the queue like any other, not a placeholder.
 */
import { ERROR_CODES, formatCompactUtcStamp, WellKnown } from "@openrift/shared";
// One definition of the reserved provider string, on the wire side: the
// database keys `(provider, external_id)` on it, and a second copy is exactly
// the pair that drifts.
import { META_USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/meta-submissions";
import type { MetaListStatus } from "@openrift/shared/types";

import type { CandidateMetaDeckCard } from "../db/index.js";
import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { isValidIsoDate } from "../lib/iso-date.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";

/**
 * How many submissions one person may have awaiting review at once.
 *
 * A pending cap rather than a rolling daily one: a meta submission
 * costs an admin a review of a whole decklist, so the thing worth bounding is
 * the queue a single person can build up, and it clears itself as the archive
 * catches up. Ten is comfortably more than a real contributor sends between
 * reviews and far below what makes the queue unusable.
 */
export const META_PENDING_SUBMISSION_LIMIT = 10;

interface MetaSubmissionProposedEvent {
  name: string;
  /** ISO `YYYY-MM-DD`. */
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  /** Where the submitter saw the results. Becomes this candidate's citation if it is linked. */
  sourceUrl: string | null;
}

interface MetaSubmissionCard {
  name: string;
  /** A `WellKnown.deckZone` value. */
  zone: string;
  quantity: number;
}

export interface MetaSubmissionArgs {
  userId: string;
  /** The live event this targets. Null exactly when {@link proposedEvent} is set. */
  metaEventId: string | null;
  /** The event this proposes. Null exactly when {@link metaEventId} is set. */
  proposedEvent: MetaSubmissionProposedEvent | null;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /** A submission always carries a list, so this is never `"none"`. */
  listStatus: Exclude<MetaListStatus, "none">;
  cards: MetaSubmissionCard[];
  note: string | null;
  /** "Now", passed in so the external id and any test are deterministic. */
  now: Date;
}

/**
 * Outcome of a submission. Discriminated so the route maps it to a typed oRPC
 * error without this service depending on oRPC.
 */
export type MetaSubmissionResult =
  | {
      status: "ok";
      submissionId: string;
      candidatePlayerId: string;
      /**
       * Card names that matched nothing. The submission is still staged: an
       * unmatched name is usually a spelling the catalog needs an alias for,
       * which is the admin's fix, not a reason to refuse the contribution.
       */
      unresolvedNames: string[];
    }
  | { status: "rate_limited"; limit: number }
  | { status: "invalid"; errors: string[] };

const DECK_ZONES = new Set<string>(Object.values(WellKnown.deckZone));

/**
 * Every reason this submission cannot be staged, checked against the same
 * bounds the tables' CHECK constraints enforce.
 *
 * The contract validates shapes; this validates the things a schema cannot
 * know, and is the backstop that keeps a bad row from failing at the insert
 * with a Postgres message no contributor can act on.
 */
export function validateMetaSubmission(args: MetaSubmissionArgs): string[] {
  const problems: string[] = [];
  if ((args.metaEventId === null) === (args.proposedEvent === null)) {
    problems.push("A submission targets exactly one event: an existing one or a proposed one");
  }
  if (args.playerName.trim() === "" || args.playerName.length > 80) {
    problems.push("playerName must be 1-80 characters");
  }
  if (!Number.isInteger(args.rank) || args.rank < 1) {
    problems.push("rank must be a positive integer");
  }
  for (const [field, value] of [
    ["wins", args.wins],
    ["losses", args.losses],
    ["draws", args.draws],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      problems.push(`${field} must be a non-negative integer`);
    }
  }
  if (args.note !== null && args.note.trim() === "") {
    problems.push("note must not be blank");
  }
  if (args.cards.length === 0) {
    problems.push("cards must not be empty");
  }
  for (const card of args.cards) {
    if (card.name.trim() === "") {
      problems.push("a card name is empty");
    }
    if (!DECK_ZONES.has(card.zone)) {
      problems.push(`card "${card.name}" has unknown zone "${card.zone}"`);
    }
    if (!Number.isInteger(card.quantity) || card.quantity < 1) {
      problems.push(`card "${card.name}" has a non-positive quantity`);
    }
  }

  const event = args.proposedEvent;
  if (event !== null) {
    if (event.name.trim() === "" || event.name.length > 120) {
      problems.push("event name must be 1-120 characters");
    }
    if (!isValidIsoDate(event.eventDate)) {
      problems.push(`eventDate "${event.eventDate}" is not a YYYY-MM-DD date`);
    }
    if (event.format.trim() === "") {
      problems.push("event format must not be empty");
    }
    if (
      event.playerCount !== null &&
      (!Number.isInteger(event.playerCount) || event.playerCount < 1)
    ) {
      problems.push("playerCount must be a positive integer");
    }
    if (
      event.organizer !== null &&
      (event.organizer.length === 0 || event.organizer.length > 120)
    ) {
      problems.push("organizer must be 1-120 characters");
    }
    if (
      event.sourceUrl !== null &&
      (event.sourceUrl.length === 0 || event.sourceUrl.length > 2000)
    ) {
      problems.push("sourceUrl must be 1-2000 characters");
    }
  }
  return problems;
}

/**
 * The per-submission key both the candidate row and the ledger row are stored
 * under. The random tail keeps two submissions of the same list by the same
 * person from colliding.
 */
export function buildMetaSubmissionExternalId(userId: string, now: Date): string {
  return `${formatCompactUtcStamp(now)}--${userId}--${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Stage one user's decklist submission and record its ledger row.
 *
 * The whole thing runs in one transaction: the candidate deck and the ledger
 * row are the same fact, and a submission the contributor can see but no admin
 * can review (or the reverse) is worse than no submission.
 */
export function submitMetaDeck(
  transact: Transact,
  args: MetaSubmissionArgs,
): Promise<MetaSubmissionResult> {
  const problems = validateMetaSubmission(args);
  if (problems.length > 0) {
    return Promise.resolve({ status: "invalid", errors: problems });
  }

  return transact(async (repos) => {
    // The advisory lock serializes this user's concurrent submissions: without
    // it, parallel requests all read the same COUNT under READ COMMITTED and
    // all pass the cap. It releases when the transaction ends.
    await repos.ingest.lockUserSubmissions(args.userId);
    const pending = await repos.metaSubmissions.countPendingByUser(args.userId);
    if (pending >= META_PENDING_SUBMISSION_LIMIT) {
      return { status: "rate_limited", limit: META_PENDING_SUBMISSION_LIMIT };
    }

    // A target the archive does not have would fail at the FK with nothing
    // useful to say, and a submission filed against a deleted event can never
    // be reviewed.
    const target =
      args.metaEventId === null ? undefined : await repos.meta.eventById(args.metaEventId);
    if (args.metaEventId !== null && target === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
    }

    // Names resolve through the shared matcher, so an alias added for the card
    // pipeline applies here too and a submission links exactly where a provider
    // upload of the same list would.
    const index = await loadCardNameIndex(repos.ingest);
    const cards: CandidateMetaDeckCard[] = args.cards.map((card) => ({
      name: card.name,
      zone: card.zone,
      quantity: card.quantity,
      cardId: resolveCardIdByName(index, card.name),
    }));

    const externalId = buildMetaSubmissionExternalId(args.userId, args.now);
    const proposed = args.proposedEvent;

    let candidateEventId: string | null = null;
    // The name the ledger keeps, so a row still reads right when the target
    // event is renamed, or was never created at all.
    let eventName: string;
    if (proposed === null) {
      // Validation guarantees the other half is set, and the lookup above
      // guarantees it resolved.
      eventName = target?.name ?? "";
    } else {
      eventName = proposed.name;
      candidateEventId = await repos.metaCandidates.insertEvent({
        provider: META_USER_SUBMISSION_PROVIDER,
        externalId,
        name: proposed.name,
        eventDate: proposed.eventDate,
        format: proposed.format,
        playerCount: proposed.playerCount,
        organizer: proposed.organizer,
        sourceUrl: proposed.sourceUrl,
        notes: null,
        extraData: null,
        metaEventId: null,
        // Unreviewed by definition: a submission is exactly the thing an admin
        // has not looked at yet.
        checkedAt: null,
      });
    }

    const candidatePlayerId = await repos.metaCandidates.insertPlayer({
      candidateEventId,
      metaEventId: candidateEventId === null ? args.metaEventId : null,
      externalId,
      playerName: args.playerName,
      rank: args.rank,
      rankIsTier: args.rankIsTier,
      wins: args.wins,
      losses: args.losses,
      draws: args.draws,
      // The legend and champion come from the list's own zones at accept, so a
      // submission never names them separately.
      legendName: null,
      legendCardId: null,
      championName: null,
      championCardId: null,
      cards,
      listStatus: args.listStatus,
      metaEventPlayerId: null,
      submittedByUserId: args.userId,
      submissionNote: args.note,
      checkedAt: null,
    });

    const submissionId = await repos.metaSubmissions.insert({
      userId: args.userId,
      provider: META_USER_SUBMISSION_PROVIDER,
      externalId,
      candidateMetaPlayerId: candidatePlayerId,
      metaEventId: args.metaEventId,
      eventName,
      playerName: args.playerName,
      note: args.note,
    });

    return {
      status: "ok",
      submissionId,
      candidatePlayerId,
      unresolvedNames: [...new Set(cards.filter((c) => c.cardId === null).map((c) => c.name))],
    };
  });
}
