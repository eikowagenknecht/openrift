/**
 * Ingest one signed-in user's decklist submission to the meta archive.
 *
 * A submission is an overlay, never a source mirror. A re-fetch replaces a
 * mirrored event's whole field (`replaceStandings`), so a contribution written
 * there would be wiped by the next recheck. Overlays are keyed per submission
 * and only review touches them.
 *
 * `chk_meta_event_player_overlays_target` permits exactly one anchor, which is
 * what shapes the two cases:
 *
 *   - Against an event the archive already has, the player overlay anchors on
 *     that live event and no event overlay is created.
 *   - Proposing an event the archive lacks, the player overlay anchors on an
 *     event overlay carrying the fields the person typed. Accepting that mints
 *     the live event and adopts the entries hanging off it, so both are
 *     reviewed as one thing.
 */
import { ERROR_CODES, formatCompactUtcStamp, WellKnown } from "@openrift/shared";
// One definition of the reserved provider string, on the wire side: the
// database keys `(provider, external_id)` on it, and a second copy is exactly
// the pair that drifts.
import { META_USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/meta-submissions";
import type {
  MetaEventFieldEdits,
  MetaListStatus,
  MetaSubmissionKind,
} from "@openrift/shared/types";

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
  /**
   * What the contributor is asking for. Advisory only: an accept writes the same
   * archive row whichever it is, and the reviewer reads it to know whether they
   * are being handed a missing list, a fuller one, or a disputed one.
   */
  kind: Exclude<MetaSubmissionKind, "event_correction">;
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
      playerOverlayId: string;
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

interface MetaEventCorrectionArgs {
  userId: string;
  /** The archived event the correction is about. */
  metaEventId: string;
  /** The new values proposed, keyed as the event's own fields. */
  fieldEdits: MetaEventFieldEdits;
  /** Always present: a set of new values with no word about where they came from is not reviewable. */
  note: string;
  /** "Now", passed in so the external id and any test are deterministic. */
  now: Date;
}

type MetaEventCorrectionResult =
  | { status: "ok"; submissionId: string }
  | { status: "rate_limited"; limit: number };

/**
 * Record one proposed correction to an archived event's own facts.
 *
 * Nothing is staged: a candidate row is a standings entry, and this is about the
 * event around them, so there is no accept that could apply it. The ledger row
 * is the whole artifact — an admin reads it, edits the event by hand, and stamps
 * the outcome the contributor reads.
 *
 * It still counts against the same pending cap as a decklist. The thing being
 * bounded is the queue one person can build up in front of a reviewer, and a
 * correction costs a reviewer just as much attention as a list does.
 */
export function submitMetaEventCorrection(
  transact: Transact,
  args: MetaEventCorrectionArgs,
): Promise<MetaEventCorrectionResult> {
  return transact(async (repos) => {
    await repos.ingest.lockUserSubmissions(args.userId);
    const pending = await repos.metaSubmissions.countPendingByUser(args.userId);
    if (pending >= META_PENDING_SUBMISSION_LIMIT) {
      return { status: "rate_limited", limit: META_PENDING_SUBMISSION_LIMIT };
    }

    const event = await repos.meta.eventById(args.metaEventId);
    if (event === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
    }

    const submissionId = await repos.metaSubmissions.insert({
      userId: args.userId,
      provider: META_USER_SUBMISSION_PROVIDER,
      externalId: buildMetaSubmissionExternalId(args.userId, args.now),
      playerOverlayId: null,
      metaEventId: args.metaEventId,
      eventName: event.name,
      playerName: null,
      kind: "event_correction",
      // The value, never JSON text: postgres.js already serializes a jsonb
      // parameter, and text would land as a string scalar.
      fieldEdits: args.fieldEdits,
      note: args.note,
    });

    return { status: "ok", submissionId };
  });
}

/**
 * Stage one user's decklist submission and record its ledger row.
 *
 * The whole thing runs in one transaction: the overlay and the ledger row are
 * the same fact, and a submission the contributor can see but no admin can
 * review (or the reverse) is worse than no submission.
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
    const cards = args.cards.map((card, lineNumber) => ({
      lineNumber,
      zone: card.zone,
      quantity: card.quantity,
      cardName: card.name,
      cardId: resolveCardIdByName(index, card.name),
    }));

    const externalId = buildMetaSubmissionExternalId(args.userId, args.now);
    const proposed = args.proposedEvent;

    let eventOverlayId: string | null = null;
    // The name the ledger keeps, so a row still reads right when the target
    // event is renamed, or was never created at all.
    let eventName: string;
    if (proposed === null) {
      if (target === undefined) {
        // Validation requires an event or a proposal, so this is a client
        // constructing its own payload.
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A submission needs an event.");
      }
      eventName = target.name;
    } else {
      eventName = proposed.name;
      // A proposed event is an overlay with no live target. Accepting it mints
      // the live row and adopts the players hanging off it, so the event and
      // its entry are reviewed and accepted as one thing.
      eventOverlayId = await repos.metaOverlays.insertEventOverlay({
        provider: META_USER_SUBMISSION_PROVIDER,
        externalId,
        metaEventId: null,
        name: proposed.name,
        eventDate: proposed.eventDate,
        format: proposed.format,
        playerCount: proposed.playerCount,
        organizer: proposed.organizer,
        notes: null,
        tier: null,
        country: null,
        location: null,
        claimedFields: ["name", "eventDate", "format", "playerCount", "organizer"],
        submittedByUserId: args.userId,
        submissionNote: args.note,
      });
    }

    const playerOverlayId = await repos.metaOverlays.insertPlayerOverlay(
      {
        eventOverlayId,
        metaEventId: eventOverlayId === null ? args.metaEventId : null,
        metaEventPlayerId: null,
        playerName: args.playerName,
        rank: args.rank,
        rankIsTier: args.rankIsTier,
        wins: args.wins,
        losses: args.losses,
        draws: args.draws,
        // The legend and champion come from the list's own zones at promotion,
        // so a submission never names them separately.
        legendCardId: null,
        championCardId: null,
        listStatus: args.listStatus,
        claimedFields: [
          "playerName",
          "rank",
          "rankIsTier",
          "wins",
          "losses",
          "draws",
          "listStatus",
          "cards",
        ],
        submittedByUserId: args.userId,
        submissionNote: args.note,
      },
      cards,
    );

    const submissionId = await repos.metaSubmissions.insert({
      userId: args.userId,
      provider: META_USER_SUBMISSION_PROVIDER,
      externalId,
      playerOverlayId,
      metaEventId: args.metaEventId,
      eventName,
      playerName: args.playerName,
      kind: args.kind,
      note: args.note,
    });

    return {
      status: "ok",
      submissionId,
      playerOverlayId,
      unresolvedNames: [...new Set(cards.filter((c) => c.cardId === null).map((c) => c.cardName))],
    };
  });
}
