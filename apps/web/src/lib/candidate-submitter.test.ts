import type { CandidateCardResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildSourceSubmitters, submitterLabel } from "@/lib/candidate-submitter";

function stubSource(overrides: Partial<CandidateCardResponse> = {}): CandidateCardResponse {
  return {
    id: "cc1",
    provider: "gallery",
    name: "Yasuo",
    submittedByUserId: null,
    submittedByName: null,
    submissionNote: null,
    ...overrides,
  } as CandidateCardResponse;
}

describe("buildSourceSubmitters", () => {
  it("returns an empty map when no source was user-submitted", () => {
    expect(buildSourceSubmitters([stubSource(), stubSource({ id: "cc2" })])).toEqual({});
  });

  it("keys submitters by candidate card id", () => {
    const submitters = buildSourceSubmitters([
      stubSource(),
      stubSource({
        id: "cc2",
        provider: "usersubmission",
        submittedByUserId: "u1",
        submittedByName: "tempest_fox",
        submissionNote: "Energy is 3, not 4.",
      }),
    ]);

    expect(submitters).toEqual({
      cc2: { userId: "u1", name: "tempest_fox", note: "Energy is 3, not 4." },
    });
  });

  it("keeps a note whose submitter account was deleted", () => {
    const submitters = buildSourceSubmitters([
      stubSource({ id: "cc2", submittedByUserId: null, submissionNote: "Art is mirrored." }),
    ]);

    expect(submitters.cc2).toEqual({ userId: null, name: null, note: "Art is mirrored." });
  });

  it("keeps a submitter who left no note", () => {
    const submitters = buildSourceSubmitters([
      stubSource({ id: "cc2", submittedByUserId: "u1", submittedByName: "ionia_main" }),
    ]);

    expect(submitters.cc2).toEqual({ userId: "u1", name: "ionia_main", note: null });
  });

  it("returns an empty map for no sources at all", () => {
    expect(buildSourceSubmitters([])).toEqual({});
  });
});

describe("submitterLabel", () => {
  it("prefers the display name", () => {
    expect(submitterLabel({ userId: "u1", name: "tempest_fox", note: null })).toBe("tempest_fox");
  });

  it("falls back to a shortened id when the user set no name", () => {
    expect(submitterLabel({ userId: "abcdef0123456789", name: null, note: null })).toBe(
      "user abcdef01",
    );
  });

  it("does not truncate an id shorter than the cutoff", () => {
    expect(submitterLabel({ userId: "abc", name: null, note: null })).toBe("user abc");
  });

  it("marks a deleted account when neither name nor id survived", () => {
    expect(submitterLabel({ userId: null, name: null, note: "orphaned" })).toBe("deleted account");
  });
});
