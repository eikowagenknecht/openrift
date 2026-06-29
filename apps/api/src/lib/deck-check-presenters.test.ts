import { describe, expect, it } from "vitest";

import type {
  DeckCheckEntry,
  DeckCheckEntrySummary,
  DeckCheckEvent,
  DeckCheckKey,
} from "../repositories/deck-check.js";
import { toEntrySummary, toEventSummary, toKey } from "./deck-check-presenters.js";

const createdAt = new Date("2026-06-01T10:00:00.000Z");
const updatedAt = new Date("2026-06-02T11:30:00.000Z");

function event(overrides: Partial<DeckCheckEvent> = {}): DeckCheckEvent {
  return {
    id: "ev-1",
    groupId: null,
    name: "Friday Skirmish",
    eventDate: new Date("2026-06-18T00:00:00.000Z"),
    format: "standard",
    allowedSets: ["OGN"],
    status: "active",
    listLockMode: "at_deadline",
    allowSelfSubmission: false,
    submissionToken: "sub-tok",
    submissionsCloseAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function entry(overrides: Partial<DeckCheckEntry> = {}): DeckCheckEntry {
  return {
    id: "en-1",
    tournamentId: "ev-1",
    participantId: "p-1",
    externalId: "1234",
    submittedAt: new Date("2026-06-18T20:00:00.000Z"),
    allowDeckPublishing: true,
    allowNameSharing: true,
    allowRiotIdSharing: true,
    contentHash: "hash",
    state: "submitted",
    reviewOutcome: null,
    checkedBy: null,
    checkedAt: null,
    approvedBy: null,
    approvedAt: null,
    unlockRequestedAt: null,
    preEditLines: null,
    notes: null,
    changeSummary: null,
    withdrawnAt: null,
    playerMessage: null,
    createdAt,
    updatedAt,
    playerName: "A. Player",
    riotId: null,
    claimedUserId: null,
    claimSource: null,
    claimedAt: null,
    claimBlockedAt: null,
    claimToken: "ct-1",
    ...overrides,
  };
}

function summary(overrides: Partial<DeckCheckEntrySummary> = {}): DeckCheckEntrySummary {
  return {
    ...entry(),
    checkedByName: null,
    approvedByName: null,
    claimedUserName: null,
    participantStatus: "active",
    copyCount: 60,
    verifiedCopyCount: 40,
    unmatchedLineCount: 2,
    ...overrides,
  };
}

function key(
  overrides: Partial<DeckCheckKey & { createdByName?: string | null }> = {},
): DeckCheckKey & { createdByName?: string | null } {
  return {
    id: "key-1",
    hostType: "user",
    hostUserId: "user-1",
    hostOrgId: null,
    tokenHash: "hash",
    tokenPrefix: "orpk_abcd",
    label: "Provider key",
    createdBy: "user-1",
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("toEventSummary", () => {
  it("trims the event date to YYYY-MM-DD and defaults counts to zero", () => {
    const result = toEventSummary(event());
    expect(result.eventDate).toBe("2026-06-18");
    expect(result.entryCount).toBe(0);
    expect(result.approvedCount).toBe(0);
    expect(result.checkedCount).toBe(0);
  });

  it("withholds the submission token unless self-submission is open", () => {
    expect(toEventSummary(event({ allowSelfSubmission: false })).submissionToken).toBeNull();
    expect(toEventSummary(event({ allowSelfSubmission: true })).submissionToken).toBe("sub-tok");
  });

  it("passes folded counts through when present", () => {
    const result = toEventSummary({ ...event(), entryCount: 5, approvedCount: 2, checkedCount: 3 });
    expect(result.entryCount).toBe(5);
    expect(result.approvedCount).toBe(2);
    expect(result.checkedCount).toBe(3);
  });
});

describe("toEntrySummary", () => {
  it("classifies the source from the external id", () => {
    expect(toEntrySummary(summary({ externalId: "1234" })).source).toBe("api");
    expect(toEntrySummary(summary({ externalId: "openrift:user-1" })).source).toBe("self");
  });

  it("flags a list changed since review when a change summary is stored", () => {
    expect(toEntrySummary(summary({ changeSummary: null })).changedSinceReview).toBe(false);
    expect(
      toEntrySummary(summary({ changeSummary: { added: [], removed: [] } as never }))
        .changedSinceReview,
    ).toBe(true);
  });

  // An editable list is not yet delivered to a judge (TR 401.3, ADR-027): its
  // copy/progress counts stay hidden even though the row still renders.
  it("hides copy and progress counts while the list is still editable", () => {
    const editable = toEntrySummary(summary({ state: "editable" }));
    expect(editable.copyCount).toBe(0);
    expect(editable.verifiedCopyCount).toBe(0);
    expect(editable.unmatchedLineCount).toBe(0);
  });

  it("shows copy and progress counts once the list is submitted", () => {
    const submitted = toEntrySummary(summary({ state: "submitted" }));
    expect(submitted.copyCount).toBe(60);
    expect(submitted.verifiedCopyCount).toBe(40);
    expect(submitted.unmatchedLineCount).toBe(2);
  });
});

describe("toKey", () => {
  it("maps the row and defaults the creator name to null when not joined", () => {
    expect(toKey(key())).toEqual({
      id: "key-1",
      tokenPrefix: "orpk_abcd",
      label: "Provider key",
      createdByName: null,
      createdAt: createdAt.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    });
  });

  it("carries a joined creator name and serializes usage timestamps", () => {
    const result = toKey(
      key({ createdByName: "Owner", lastUsedAt: updatedAt, revokedAt: createdAt }),
    );
    expect(result.createdByName).toBe("Owner");
    expect(result.lastUsedAt).toBe(updatedAt.toISOString());
    expect(result.revokedAt).toBe(createdAt.toISOString());
  });
});
