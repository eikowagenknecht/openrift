import { diffCardLines } from "@openrift/shared/deck-check";
import type { DeckCheckCardLine } from "@openrift/shared/deck-check";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { DeckCheckChangeSummary } from "@openrift/shared/types/api/deck-check";

import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { DeckCheckEntry } from "../repositories/deck-check-entries.js";
import type { DeckCheckEntryCard } from "../repositories/deck-check-entry-cards.js";

/**
 * Judges are never bound by this; `allow_self_submission` gates only the
 * creation of new entries, and is checked separately.
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
 * The pre-edit baseline (`preEditLines`) is not cleared here; it persists
 * across unlock/submit cycles until a judge approves or checks the entry.
 */
export async function submitEntryList(
  repos: Repos,
  entry: DeckCheckEntry,
  submittedAt?: Date,
): Promise<DeckCheckEntry> {
  let changeSummary: DeckCheckChangeSummary | null = null;
  if (entry.preEditLines) {
    const cards = await repos.deckCheck.listCardsForEntry(entry.id);
    const diff = diffCardLines(entry.preEditLines, storedCardLines(cards));
    changeSummary = summaryIsEmpty(diff) ? null : diff;
  }
  const updated = await repos.deckCheck.updateEntry(entry.id, {
    state: "submitted",
    submittedAt: submittedAt ?? new Date(),
    changeSummary,
  });
  return updated ?? entry;
}

/**
 * Keeps the existing `preEditLines` baseline on a self-unlock that already
 * has one; snapshots the current lines as the new baseline otherwise.
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
    preEditLines,
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

/** Run wherever an entry (or its event) is loaded; a no-op while the window is open. */
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
  state: "editable" | "submitted" | "approved" | "checked" | "withdrawn";
  reviewOutcome?: "ok" | "issue" | null;
  notes?: string | null;
  playerMessage?: string | null;
}

// oxlint-disable-next-line max-lines-per-function -- one branch per transition, splitting hurts readability
export async function applyJudgeTransition(
  repos: Repos,
  judgeId: string,
  entry: DeckCheckEntry,
  input: JudgeTransitionInput,
): Promise<DeckCheckEntry> {
  if (entry.state === "withdrawn" && input.state !== "submitted") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Entry is withdrawn. Restore it to submitted before other changes.",
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
      if (entry.state !== "approved") {
        throw conflict("Only an approved entry can be checked. Approve the list first.");
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
      // A clean check fills all found ticks; a flagged check leaves them as the judge left them.
      if (input.reviewOutcome === "ok") {
        await repos.deckCheck.markAllCopiesFound(entry.id);
      }
      return updated ?? entry;
    }

    case "editable": {
      if (!entry.claimedUserId) {
        throw conflict("No linked player can edit this entry. Link an account first.");
      }
      const unlocked = await unlockEntryToEditable(repos, entry, {
        markIssue: input.reviewOutcome === "issue",
      });
      if (Object.keys(annotations).length === 0) {
        return unlocked;
      }
      const annotated = await repos.deckCheck.updateEntry(entry.id, annotations);
      return annotated ?? unlocked;
    }

    case "withdrawn": {
      // Sets the same fields the provider's ingest sets on a withdrawal.
      const updated = await repos.deckCheck.updateEntry(entry.id, {
        ...annotations,
        state: "withdrawn",
        withdrawnAt: new Date(),
        unlockRequestedAt: null,
      });
      return updated ?? entry;
    }

    case "submitted": {
      if (entry.state === "withdrawn") {
        // Pre-withdrawal state is not restored; the entry needs re-review.
        const updated = await repos.deckCheck.updateEntry(entry.id, {
          ...annotations,
          state: "submitted",
          withdrawnAt: null,
        });
        return updated ?? entry;
      }
      if (entry.state === "editable") {
        const submitted = await submitEntryList(repos, entry);
        if (Object.keys(annotations).length === 0) {
          return submitted;
        }
        const annotated = await repos.deckCheck.updateEntry(entry.id, annotations);
        return annotated ?? submitted;
      }
      if (entry.state === "approved") {
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
        const updated = await repos.deckCheck.updateEntry(entry.id, {
          ...annotations,
          state: "submitted",
          reviewOutcome: null,
          checkedBy: null,
          checkedAt: null,
        });
        await repos.deckCheck.clearAllCopiesFound(entry.id);
        return updated ?? entry;
      }
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
