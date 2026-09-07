import type { CandidateCardResponse } from "@openrift/shared";

/**
 * Attribution for a candidate contributed through the /contribute forms.
 * Only `usersubmission` candidates carry one; every scraped provider has none.
 * `userId` goes null once the account is deleted (`ON DELETE SET NULL`).
 */
export interface SourceSubmitter {
  userId: string | null;
  name: string | null;
  note: string | null;
}

// Keyed by candidate card id: candidate printing rows carry no attribution
// of their own and resolve it through the parent `candidateCardId`.
export function buildSourceSubmitters(
  sources: CandidateCardResponse[],
): Record<string, SourceSubmitter> {
  return Object.fromEntries(
    sources
      .filter((s) => s.submittedByUserId !== null || s.submissionNote !== null)
      .map((s) => [
        s.id,
        { userId: s.submittedByUserId, name: s.submittedByName, note: s.submissionNote },
      ]),
  );
}

// A deleted account keeps the note but drops the id.
export function submitterLabel(submitter: SourceSubmitter): string {
  if (submitter.name) {
    return submitter.name;
  }
  if (submitter.userId) {
    return `user ${submitter.userId.slice(0, 8)}`;
  }
  return "deleted account";
}
