/**
 * Every entry point here only touches `pending` rows, so a check that runs
 * twice (or crashes between check and resolve) settles the same way.
 */
import { normalizeNameForIdentity } from "@openrift/shared/utils";

import type { CardSubmissionStatus } from "../../../db/tables/candidates.js";
import type { Repos } from "../../../deps.js";
import { adoptedFields, computeProposedDiff } from "../lib/card-submission-diff.js";

export function outcomeForCheckedSubmission(
  proposedDiffSize: number,
  adoptedCount: number,
): Exclude<CardSubmissionStatus, "pending"> {
  if (proposedDiffSize === 0) {
    return "already_correct";
  }
  return adoptedCount > 0 ? "accepted" : "not_applied";
}

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

    // A new-card submission had no card at submission time, so the stored
    // slug can't be used; look up the live card by name instead.
    const liveCard = await repos.cardSubmissions.liveCardByNormName(
      normalizeNameForIdentity(proposal.card.name),
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

/** No-ops for candidates from scraped providers, which have no ledger row. */
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
