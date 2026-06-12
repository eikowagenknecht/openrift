import { diffCardLines, ERROR_CODES } from "@openrift/shared";
import type { DeckCheckCardLine, DeckCheckChangeSummary } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { DeckCheckEntry, DeckCheckEntryCard } from "../repositories/deck-check.js";

/**
 * Whether the event currently accepts player writes: it is not archived and
 * the close date (when set) has not passed. Judges are never bound by this
 * (ADR-027); `allow_self_submission` is checked separately, because it gates
 * only the creation of new entries.
 * @returns True while the window is open.
 */
export function submissionWindowOpen(event: {
  status: string;
  submissionsCloseAt: Date | null;
}): boolean {
  return (
    event.status === "active" &&
    (event.submissionsCloseAt === null || event.submissionsCloseAt.getTime() > Date.now())
  );
}

/**
 * Re-derives the normalized card lines from stored card rows, for diffing and
 * for the pre-edit baseline snapshot.
 * @returns The stored rows as plain card lines.
 */
export function storedCardLines(cards: DeckCheckEntryCard[]): DeckCheckCardLine[] {
  return cards.map((card) => ({
    name: card.rawName,
    zone: card.zone as DeckCheckCardLine["zone"],
    quantity: card.quantity,
  }));
}

function summaryIsEmpty(summary: DeckCheckChangeSummary): boolean {
  return summary.added.length === 0 && summary.removed.length === 0 && summary.changed.length === 0;
}

/**
 * The `editable → submitted` transition (ADR-027): stamps `submitted_at` and
 * stores the diff against the pre-edit baseline (the list as the judge last
 * saw it), so the judge reviews exactly what changed. The baseline itself is
 * kept until a judge approves or checks, so repeated unlock/submit cycles
 * keep diffing against the same reviewed list.
 * @returns The updated entry.
 */
export async function submitEntryList(
  repos: Repos,
  entry: DeckCheckEntry,
  submittedAt?: Date,
): Promise<DeckCheckEntry> {
  let changeSummary: string | null = null;
  if (entry.preEditLines) {
    const cards = await repos.deckCheck.listCardsForEntry(entry.id);
    const diff = diffCardLines(entry.preEditLines, storedCardLines(cards));
    changeSummary = summaryIsEmpty(diff) ? null : JSON.stringify(diff);
  }
  const updated = await repos.deckCheck.updateEntry(entry.id, {
    state: "submitted",
    submittedAt: submittedAt ?? new Date(),
    changeSummary,
  });
  return updated ?? entry;
}

/**
 * A transition into `editable` (ADR-027): the player's self-unlock from
 * `submitted`, a judge granting an unlock request, or a judge sending the
 * list back ("fix this"). Snapshots the current lines as the diff baseline —
 * except on a self-unlock that already has one, so the original reviewed
 * baseline survives repeated unlock/submit cycles.
 * @returns The updated entry.
 */
export async function unlockEntryToEditable(
  repos: Repos,
  entry: DeckCheckEntry,
  options?: { keepExistingBaseline?: boolean; markIssue?: boolean },
): Promise<DeckCheckEntry> {
  let preEditLines = entry.preEditLines;
  if (!options?.keepExistingBaseline || !preEditLines) {
    const cards = await repos.deckCheck.listCardsForEntry(entry.id);
    preEditLines = storedCardLines(cards);
  }
  const updated = await repos.deckCheck.updateEntry(entry.id, {
    state: "editable",
    preEditLines: JSON.stringify(preEditLines),
    changeSummary: null,
    unlockRequestedAt: null,
    approvedBy: null,
    approvedAt: null,
    checkedBy: null,
    checkedAt: null,
    ...(options?.markIssue ? { reviewOutcome: "issue" as const } : {}),
  });
  return updated ?? entry;
}

/**
 * The lazy deadline settle (ADR-027): an entry still `editable` once the
 * submission window closed auto-submits as-is, stamped with the close time,
 * so nobody misses the event over a forgotten button. Run wherever an entry
 * (or its event) is loaded; a no-op while the window is open.
 * @returns The settled entry, or the entry unchanged.
 */
export function settleExpiredEditable(
  repos: Repos,
  event: { status: string; submissionsCloseAt: Date | null },
  entry: DeckCheckEntry,
): Promise<DeckCheckEntry> | DeckCheckEntry {
  if (entry.state !== "editable" || submissionWindowOpen(event)) {
    return entry;
  }
  return submitEntryList(repos, entry, event.submissionsCloseAt ?? new Date());
}

export interface JudgeTransitionInput {
  state: "editable" | "submitted" | "approved" | "checked";
  reviewOutcome?: "ok" | "issue" | null;
  notes?: string | null;
  playerMessage?: string | null;
}

/**
 * Applies one judge transition, validating ADR-027's matrix: approve from
 * `submitted`; check from `submitted` or `approved` with an explicit outcome;
 * revoke / re-open back to `submitted`; hand a linked entry back to the
 * player (`editable`), optionally as a rejection; or record an issue in place
 * on a `submitted` entry that has no linked player. `withdrawn` is never a
 * judge target, and a withdrawn entry only changes through the provider.
 * @returns The updated entry.
 */
// oxlint-disable-next-line max-lines-per-function -- one branch per transition, splitting hurts readability
export async function applyJudgeTransition(
  repos: Repos,
  judgeId: string,
  entry: DeckCheckEntry,
  input: JudgeTransitionInput,
): Promise<DeckCheckEntry> {
  if (entry.state === "withdrawn") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Entry is withdrawn; only the organizer's system can restore it",
    );
  }

  const annotations = {
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.playerMessage === undefined ? {} : { playerMessage: input.playerMessage }),
  };
  const conflict = (message: string): AppError => new AppError(409, ERROR_CODES.CONFLICT, message);

  switch (input.state) {
    case "approved": {
      if (entry.state !== "submitted") {
        throw conflict("Only a submitted entry can be approved");
      }
      const updated = await repos.deckCheck.updateEntry(entry.id, {
        ...annotations,
        state: "approved",
        reviewOutcome: "ok",
        approvedBy: judgeId,
        approvedAt: new Date(),
        changeSummary: null,
        preEditLines: null,
        unlockRequestedAt: null,
      });
      return updated ?? entry;
    }

    case "checked": {
      if (entry.state !== "submitted" && entry.state !== "approved") {
        throw conflict("Only a submitted or approved entry can be checked");
      }
      if (input.reviewOutcome !== "ok" && input.reviewOutcome !== "issue") {
        throw new AppError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          "Checking requires a review outcome (ok or issue)",
        );
      }
      const updated = await repos.deckCheck.updateEntry(entry.id, {
        ...annotations,
        state: "checked",
        reviewOutcome: input.reviewOutcome,
        checkedBy: judgeId,
        checkedAt: new Date(),
        changeSummary: null,
        preEditLines: null,
        unlockRequestedAt: null,
      });
      return updated ?? entry;
    }

    case "editable": {
      if (!entry.claimedUserId) {
        throw conflict("No linked player can edit this entry; link an account first");
      }
      // Snapshot-based unlock; works from submitted, approved, and checked
      // (the after-deadline venue correction included).
      const unlocked = await unlockEntryToEditable(repos, entry, {
        markIssue: input.reviewOutcome === "issue",
      });
      if (Object.keys(annotations).length === 0) {
        return unlocked;
      }
      const annotated = await repos.deckCheck.updateEntry(entry.id, annotations);
      return annotated ?? unlocked;
    }

    case "submitted": {
      if (entry.state === "editable") {
        // Lock a list on the player's behalf (venue: "I'm done").
        const submitted = await submitEntryList(repos, entry);
        if (Object.keys(annotations).length === 0) {
          return submitted;
        }
        const annotated = await repos.deckCheck.updateEntry(entry.id, annotations);
        return annotated ?? submitted;
      }
      if (entry.state === "approved") {
        // Revoke the approval.
        const updated = await repos.deckCheck.updateEntry(entry.id, {
          ...annotations,
          state: "submitted",
          reviewOutcome: null,
          approvedBy: null,
          approvedAt: null,
          unlockRequestedAt: null,
        });
        return updated ?? entry;
      }
      if (entry.state === "checked") {
        // Re-open the check.
        const updated = await repos.deckCheck.updateEntry(entry.id, {
          ...annotations,
          state: "submitted",
          reviewOutcome: null,
          checkedBy: null,
          checkedAt: null,
        });
        return updated ?? entry;
      }
      // submitted → submitted: record an outcome in place (the rejection
      // path for entries with no linked player to hand the list back to).
      if (input.reviewOutcome === undefined || input.reviewOutcome === null) {
        throw conflict("Entry is already submitted");
      }
      const updated = await repos.deckCheck.updateEntry(entry.id, {
        ...annotations,
        reviewOutcome: input.reviewOutcome,
      });
      return updated ?? entry;
    }
  }
}
