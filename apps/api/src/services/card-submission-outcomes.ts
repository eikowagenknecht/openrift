/**
 * Stamping outcomes on in-app card submissions (ADR-036, migration 234).
 *
 * The admin's review loop has exactly two terminal actions: check ("done with
 * this one", the Check all & next button) and ignore ("reject"). Everything
 * here hangs off those, so a contributor gets a status without the admin doing
 * anything extra.
 *
 * Field accepts deliberately do not trigger anything. `acceptField` and
 * `acceptPrintingField` receive only a card/printing id plus a field and value,
 * so they cannot say which source column a value came from, and a correction
 * usually spans several fields — the first accepted one is not the submission's
 * outcome. Resolution instead re-runs the submit-time comparison and asks how
 * much of the original proposal the catalog now agrees with.
 *
 * Every entry point is idempotent: only `pending` rows are touched, so a check
 * that runs twice (or a crash between the check and the resolve) settles the
 * same way.
 */
import { normalizeNameForMatching } from "@openrift/shared/utils";

import type { CardSubmissionStatus } from "../db/index.js";
import type { Repos } from "../deps.js";
import { adoptedFields, computeProposedDiff } from "../lib/card-submission-diff.js";

/**
 * Decide a checked submission's outcome.
 *
 * An empty proposed diff means the catalog already matched everything sent.
 * That is a real outcome and not a rejection, so it gets its own status rather
 * than being folded into `not_applied`.
 *
 * @param proposedDiffSize How many fields differed when the submission was made.
 * @param adoptedCount How many of those the catalog now agrees with.
 * @returns The status to stamp.
 */
export function outcomeForCheckedSubmission(
  proposedDiffSize: number,
  adoptedCount: number,
): Exclude<CardSubmissionStatus, "pending"> {
  if (proposedDiffSize === 0) {
    return "already_correct";
  }
  return adoptedCount > 0 ? "accepted" : "not_applied";
}

/**
 * Resolve every pending submission among the given staging rows that is now
 * fully reviewed.
 *
 * "Fully reviewed" means the candidate card is checked and none of its
 * printings are still unchecked. Without that gate, checking a single printing
 * on a multi-printing submission would settle the whole thing early.
 *
 * @param repos The API repositories.
 * @param args The candidate rows just checked, the acting admin, and the instant to stamp.
 * @returns The number of submissions resolved.
 */
export async function resolveCheckedSubmissions(
  repos: Repos,
  args: { candidateCardIds: string[]; adminUserId: string; now: Date },
): Promise<number> {
  const { candidateCardIds, adminUserId, now } = args;
  if (candidateCardIds.length === 0) {
    return 0;
  }

  const pending = await repos.cardSubmissions.pendingByCandidateCardIds(candidateCardIds);
  if (pending.length === 0) {
    return 0;
  }

  const reviewStates = await repos.candidateCards.reviewStateForCandidates(
    pending
      .map((submission) => submission.candidateCardId)
      .filter((id): id is string => id !== null),
  );

  let resolved = 0;
  for (const submission of pending) {
    const candidateCardId = submission.candidateCardId;
    if (candidateCardId === null) {
      continue;
    }
    const reviewState = reviewStates.get(candidateCardId);
    if (!reviewState?.checked || reviewState.uncheckedPrintings > 0) {
      continue;
    }

    const proposal = await repos.candidateCards.proposalForCandidate(candidateCardId);
    if (!proposal) {
      continue;
    }

    // Re-resolve the live card by name rather than trusting the slug stored at
    // submission time: a new-card submission had no card then and does now,
    // which is exactly the case that should read as accepted.
    const liveCard = await repos.cardSubmissions.liveCardByNormName(
      normalizeNameForMatching(proposal.card.name),
    );
    const { snapshot } = await repos.cardSubmissions.liveSnapshot(
      liveCard?.id ?? null,
      proposal.printings.map((printing) => printing.shortCode),
    );
    const currentDiff = computeProposedDiff(proposal, snapshot);
    const adopted = adoptedFields(submission.proposedDiff, currentDiff);

    const status = outcomeForCheckedSubmission(submission.proposedDiff.length, adopted.length);

    await repos.cardSubmissions.resolve(submission.id, {
      status,
      resolvedAt: now,
      resolvedByUserId: adminUserId,
      acceptedCardId: status === "accepted" ? (liveCard?.id ?? null) : null,
    });
    resolved += 1;
  }

  return resolved;
}

/**
 * Mark the submission behind an ignored candidate as rejected.
 *
 * The ignore path only carries `(provider, external_id)`, which is enough:
 * ADR-036 mints a per-submission external_id, so the key identifies exactly one
 * submission. Candidates from scraped providers have no ledger row and this
 * no-ops for them.
 *
 * @param repos The API repositories.
 * @param args The ignored candidate's key, the acting admin, and the instant to stamp.
 */
export async function rejectIgnoredSubmission(
  repos: Repos,
  args: { provider: string; externalId: string; adminUserId: string; now: Date },
): Promise<void> {
  const submission = await repos.cardSubmissions.findByExternalId(args.provider, args.externalId);
  if (!submission || submission.status === "rejected") {
    return;
  }
  await repos.cardSubmissions.resolve(submission.id, {
    status: "rejected",
    resolvedAt: args.now,
    resolvedByUserId: args.adminUserId,
  });
}

/**
 * Return a rejected submission to the queue when its candidate is unignored, so
 * a misclick is recoverable and the contributor's page follows. Any note the
 * admin wrote is kept, on the assumption they will reuse or edit it.
 *
 * @param repos The API repositories.
 * @param args The unignored candidate's key.
 */
export async function reopenUnignoredSubmission(
  repos: Repos,
  args: { provider: string; externalId: string },
): Promise<void> {
  const submission = await repos.cardSubmissions.findByExternalId(args.provider, args.externalId);
  if (!submission || submission.status !== "rejected") {
    return;
  }
  await repos.cardSubmissions.reopen(submission.id);
}
