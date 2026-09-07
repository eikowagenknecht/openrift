import { describe, expect, it } from "vitest";

import type { CardSubmissionRow } from "../repositories/card-submissions.js";
import { toCardSubmissionStatus } from "./card-submission-presenters.js";

const ROW = {
  id: "sub-1",
  userId: "user-1",
  provider: "usersubmission",
  externalId: "jinx--20260813-1200--user-1",
  candidateCardId: "cc-1",
  kind: "correction",
  cardName: "Jinx",
  cardSlug: "jinx",
  note: "Saw it on the back of the box.",
  proposedDiff: ["card.energy"],
  status: "accepted",
  resolutionReason: null,
  resolutionNote: null,
  resolvedAt: new Date("2026-08-13T12:00:00Z"),
  resolvedByUserId: "admin-1",
  acceptedCardId: "card-1",
  createdAt: new Date("2026-08-12T09:30:00Z"),
  updatedAt: new Date("2026-08-13T12:00:00Z"),
} as unknown as CardSubmissionRow;

describe("toCardSubmissionStatus", () => {
  it("maps a resolved submission to the contributor shape", () => {
    expect(toCardSubmissionStatus(ROW)).toEqual({
      id: "sub-1",
      kind: "correction",
      cardName: "Jinx",
      cardSlug: "jinx",
      status: "accepted",
      note: "Saw it on the back of the box.",
      reason: null,
      resolutionNote: null,
      createdAt: "2026-08-12T09:30:00.000Z",
      resolvedAt: "2026-08-13T12:00:00.000Z",
    });
  });

  it("leaves resolvedAt null while the submission is pending", () => {
    const pending = { ...ROW, status: "pending", resolvedAt: null } as CardSubmissionRow;
    expect(toCardSubmissionStatus(pending).resolvedAt).toBeNull();
  });

  it("carries the reason and note through for a rejection", () => {
    const rejected = {
      ...ROW,
      status: "rejected",
      resolutionReason: "not_a_card",
      resolutionNote: "This is a Magic card.",
    } as CardSubmissionRow;
    const result = toCardSubmissionStatus(rejected);
    expect(result.reason).toBe("not_a_card");
    expect(result.resolutionNote).toBe("This is a Magic card.");
  });

  it("never exposes review-side bookkeeping", () => {
    const result = toCardSubmissionStatus(ROW) as Record<string, unknown>;
    expect(result.proposedDiff).toBeUndefined();
    expect(result.candidateCardId).toBeUndefined();
    expect(result.acceptedCardId).toBeUndefined();
    expect(result.userId).toBeUndefined();
  });
});
