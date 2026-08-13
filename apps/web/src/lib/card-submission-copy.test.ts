import type {
  CardSubmissionKind,
  CardSubmissionReason,
  CardSubmissionStatus,
} from "@openrift/shared/contracts/card-submissions";
import { describe, expect, it } from "vitest";

import {
  submissionExplanation,
  submissionKindLabels,
  submissionReasonLabels,
  submissionReasonSentences,
  submissionStatusBadgeVariant,
  submissionStatusHints,
  submissionStatusLabels,
} from "./card-submission-copy";

const STATUSES: CardSubmissionStatus[] = [
  "pending",
  "accepted",
  "already_correct",
  "not_applied",
  "rejected",
];
const REASONS: CardSubmissionReason[] = [
  "duplicate",
  "already_correct",
  "unverified",
  "not_a_card",
  "bad_image",
];
const KINDS: CardSubmissionKind[] = ["new_card", "correction", "image"];

describe("copy coverage", () => {
  it("has a label, variant and hint entry for every status", () => {
    for (const status of STATUSES) {
      expect(submissionStatusLabels[status]).toBeTruthy();
      expect(submissionStatusBadgeVariant[status]).toBeTruthy();
      expect(submissionStatusHints).toHaveProperty(status);
    }
  });

  it("has a sentence and a short label for every reason", () => {
    for (const reason of REASONS) {
      expect(submissionReasonSentences[reason]).toBeTruthy();
      expect(submissionReasonLabels[reason]).toBeTruthy();
    }
  });

  it("has a label for every kind", () => {
    for (const kind of KINDS) {
      expect(submissionKindLabels[kind]).toBeTruthy();
    }
  });

  it("shows the same wording for not_applied and rejected", () => {
    // The split between them is an internal abuse signal, not something to
    // point at a contributor who simply could not be verified.
    expect(submissionStatusLabels.not_applied).toBe(submissionStatusLabels.rejected);
    expect(submissionStatusBadgeVariant.not_applied).toBe(submissionStatusBadgeVariant.rejected);
  });

  it("uses no internal pipeline vocabulary", () => {
    const allCopy = [
      ...Object.values(submissionStatusLabels),
      ...Object.values(submissionReasonSentences),
      ...Object.values(submissionKindLabels),
      ...Object.values(submissionStatusHints).filter((hint) => hint !== null),
    ].join(" ");
    for (const jargon of ["candidate", "provider", "ignored", "staging", "usersubmission"]) {
      expect(allCopy.toLowerCase()).not.toContain(jargon);
    }
  });
});

describe("submissionExplanation", () => {
  it("prefers the admin's own words", () => {
    expect(submissionExplanation("not_a_card", "This is a Magic card.")).toBe(
      "This is a Magic card.",
    );
  });

  it("falls back to the canned sentence for the reason", () => {
    expect(submissionExplanation("duplicate", null)).toBe(submissionReasonSentences.duplicate);
  });

  it("returns nothing when neither is set", () => {
    expect(submissionExplanation(null, null)).toBeNull();
  });

  it("returns the note even without a reason", () => {
    expect(submissionExplanation(null, "Thanks, added.")).toBe("Thanks, added.");
  });
});
