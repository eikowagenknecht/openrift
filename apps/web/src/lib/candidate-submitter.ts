import type { CandidateCardResponse } from "@openrift/shared";

/**
 * Attribution for a candidate contributed through the /contribute forms.
 * Only `usersubmission` candidates carry one; every scraped provider has none.
 */
export interface SourceSubmitter {
  /** Null once the account is deleted — the FK is `ON DELETE SET NULL`. */
  userId: string | null;
  /** Null when the user never set a display name. */
  name: string | null;
  note: string | null;
}

/**
 * Map candidate-card id -> submitter, for the sources that have one. Candidate
 * printing rows carry no attribution of their own, so they resolve theirs
 * through the parent `candidateCardId` — which is why this is keyed by card id
 * rather than being read straight off the row.
 * @returns Submitter info keyed by candidate card id, omitting sources with neither a submitter nor a note.
 */
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

/**
 * A deleted account leaves the note behind but drops the id, so fall back
 * through name -> shortened id -> a plain marker rather than rendering a
 * dangling "by".
 * @returns Human-readable label for a submitter.
 */
export function submitterLabel(submitter: SourceSubmitter): string {
  if (submitter.name) {
    return submitter.name;
  }
  if (submitter.userId) {
    return `user ${submitter.userId.slice(0, 8)}`;
  }
  return "deleted account";
}
