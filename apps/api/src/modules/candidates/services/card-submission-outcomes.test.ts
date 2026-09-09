import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../../deps.js";
import { mockIo, mockUnlink, resetImageMocks } from "../../../test/image-mocks.js";
import {
  outcomeForCheckedSubmission,
  rejectIgnoredSubmission,
  reopenUnignoredSubmission,
  resolveCheckedSubmissions,
} from "./card-submission-outcomes.js";

const NOW = new Date("2026-08-13T12:00:00Z");
const ADMIN_ID = "admin-1";

interface StubOptions {
  pending?: unknown[];
  reviewState?: { checked: boolean; uncheckedPrintings: number };
  proposal?: unknown;
  liveCard?: { id: string; slug: string } | null;
  currentlyDiffering?: string[];
  candidateImageUrls?: string[];
  urlsInUse?: string[];
}

beforeEach(() => {
  resetImageMocks();
});

function stubRepos(options: StubOptions = {}) {
  const resolve = vi.fn();
  const reopen = vi.fn();
  const candidateCardId = "cc-1";
  const repos = {
    cardSubmissions: {
      pendingByCandidateCardIds: vi.fn(async () => options.pending ?? []),
      findByExternalId: vi.fn(async () => null),
      liveCardByNormName: vi.fn(async () => options.liveCard ?? null),
      liveSnapshot: vi.fn(async () => ({
        snapshot: {
          card: options.liveCard
            ? {
                name: "Jinx",
                type: "unit",
                might: null,
                energy: null,
                power: null,
                mightBonus: null,
                tags: [],
              }
            : null,
          printings: new Map(),
        },
        cardSlug: options.liveCard?.slug ?? null,
      })),
      resolve,
      reopen,
      candidatePrintingImageUrls: vi.fn(async () => options.candidateImageUrls ?? []),
    },
    printingImages: {
      originalUrlsInUse: vi.fn(async () => new Set(options.urlsInUse)),
    },
    candidateCards: {
      reviewStateForCandidates: vi.fn(
        async () =>
          new Map([
            [candidateCardId, options.reviewState ?? { checked: true, uncheckedPrintings: 0 }],
          ]),
      ),
      proposalForCandidate: vi.fn(
        async () => options.proposal ?? { card: { name: "Jinx" }, printings: [] },
      ),
    },
  } as unknown as Repos;
  return { repos, resolve, reopen };
}

function pendingSubmission(proposedDiff: string[]) {
  return { id: "sub-1", candidateCardId: "cc-1", status: "pending", proposedDiff };
}

describe("outcomeForCheckedSubmission", () => {
  it("calls an empty proposal already_correct", () => {
    expect(outcomeForCheckedSubmission(0, 0)).toBe("already_correct");
  });

  it("calls a partly adopted proposal accepted", () => {
    expect(outcomeForCheckedSubmission(3, 1)).toBe("accepted");
  });

  it("calls an unadopted proposal not_applied", () => {
    expect(outcomeForCheckedSubmission(2, 0)).toBe("not_applied");
  });
});

describe("resolveCheckedSubmissions", () => {
  it("does nothing without candidates", async () => {
    const { repos, resolve } = stubRepos();
    expect(
      await resolveCheckedSubmissions(repos, {
        candidateCardIds: [],
        adminUserId: ADMIN_ID,
        now: NOW,
        io: mockIo,
      }),
    ).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("accepts a submission whose proposal the catalog now matches", async () => {
    const { repos, resolve } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      liveCard: { id: "card-1", slug: "jinx" },
    });

    expect(
      await resolveCheckedSubmissions(repos, {
        candidateCardIds: ["cc-1"],
        adminUserId: ADMIN_ID,
        now: NOW,
        io: mockIo,
      }),
    ).toBe(1);
    expect(resolve).toHaveBeenCalledWith("sub-1", {
      status: "accepted",
      resolvedAt: NOW,
      resolvedByUserId: ADMIN_ID,
      acceptedCardId: "card-1",
    });
  });

  it("marks a submission that proposed nothing as already_correct", async () => {
    const { repos, resolve } = stubRepos({ pending: [pendingSubmission([])] });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).toHaveBeenCalledWith(
      "sub-1",
      expect.objectContaining({ status: "already_correct", acceptedCardId: null }),
    );
  });

  it("marks a still-unmatched proposal as not_applied", async () => {
    const { repos, resolve } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      liveCard: null,
    });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).toHaveBeenCalledWith(
      "sub-1",
      expect.objectContaining({ status: "not_applied" }),
    );
  });

  it("waits for the printings before settling a submission", async () => {
    const { repos, resolve } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      reviewState: { checked: true, uncheckedPrintings: 2 },
    });

    expect(
      await resolveCheckedSubmissions(repos, {
        candidateCardIds: ["cc-1"],
        adminUserId: ADMIN_ID,
        now: NOW,
        io: mockIo,
      }),
    ).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("waits for the card itself to be checked", async () => {
    const { repos, resolve } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      reviewState: { checked: false, uncheckedPrintings: 0 },
    });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("skips a submission whose staging row is gone", async () => {
    const { repos, resolve } = stubRepos({
      pending: [{ id: "sub-1", candidateCardId: null, status: "pending", proposedDiff: [] }],
    });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("deletes the uploads of a submission that was not applied", async () => {
    const upload = "/media/submissions/0198f000-0000-7000-8000-00000000000a.jpg";
    const { repos } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      liveCard: null,
      candidateImageUrls: [upload, "https://example.test/photo.jpg"],
    });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(String(mockUnlink.mock.calls[0]?.[0])).toContain(
      "submissions/0198f000-0000-7000-8000-00000000000a.jpg",
    );
  });

  it("keeps an upload an image_files row still points at", async () => {
    const upload = "/media/submissions/0198f000-0000-7000-8000-00000000000b.png";
    const { repos } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      liveCard: null,
      candidateImageUrls: [upload],
      urlsInUse: [upload],
    });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("keeps the uploads of an accepted submission", async () => {
    const { repos } = stubRepos({
      pending: [pendingSubmission(["card.new"])],
      liveCard: { id: "card-1", slug: "jinx" },
      candidateImageUrls: ["/media/submissions/0198f000-0000-7000-8000-00000000000c.jpg"],
    });

    await resolveCheckedSubmissions(repos, {
      candidateCardIds: ["cc-1"],
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });

    expect(mockUnlink).not.toHaveBeenCalled();
  });
});

describe("rejectIgnoredSubmission", () => {
  it("rejects the submission behind the ignored key", async () => {
    const { repos, resolve } = stubRepos();
    repos.cardSubmissions.findByExternalId = vi.fn(
      async () => ({ id: "sub-1", status: "pending" }) as never,
    );

    await rejectIgnoredSubmission(repos, {
      provider: "usersubmission",
      externalId: "jinx--20260813-1200--u1",
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).toHaveBeenCalledWith("sub-1", {
      status: "rejected",
      resolvedAt: NOW,
      resolvedByUserId: ADMIN_ID,
    });
  });

  it("deletes the uploads of the rejected submission", async () => {
    const { repos } = stubRepos({
      candidateImageUrls: ["/media/submissions/0198f000-0000-7000-8000-00000000000d.jpg"],
    });
    repos.cardSubmissions.findByExternalId = vi.fn(
      async () => ({ id: "sub-1", status: "pending", candidateCardId: "cc-1" }) as never,
    );

    await rejectIgnoredSubmission(repos, {
      provider: "usersubmission",
      externalId: "jinx--20260813-1200--u1",
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });

    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("no-ops for a scraped provider with no ledger row", async () => {
    const { repos, resolve } = stubRepos();
    await rejectIgnoredSubmission(repos, {
      provider: "tcgplayer",
      externalId: "12345",
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("is idempotent for an already rejected submission", async () => {
    const { repos, resolve } = stubRepos();
    repos.cardSubmissions.findByExternalId = vi.fn(
      async () => ({ id: "sub-1", status: "rejected" }) as never,
    );

    await rejectIgnoredSubmission(repos, {
      provider: "usersubmission",
      externalId: "jinx--20260813-1200--u1",
      adminUserId: ADMIN_ID,
      now: NOW,
      io: mockIo,
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("reopenUnignoredSubmission", () => {
  it("returns a rejected submission to the queue", async () => {
    const { repos, reopen } = stubRepos();
    repos.cardSubmissions.findByExternalId = vi.fn(
      async () => ({ id: "sub-1", status: "rejected" }) as never,
    );

    await reopenUnignoredSubmission(repos, {
      provider: "usersubmission",
      externalId: "jinx--20260813-1200--u1",
    });
    expect(reopen).toHaveBeenCalledWith("sub-1");
  });

  it("leaves a submission that was never rejected alone", async () => {
    const { repos, reopen } = stubRepos();
    repos.cardSubmissions.findByExternalId = vi.fn(
      async () => ({ id: "sub-1", status: "accepted" }) as never,
    );

    await reopenUnignoredSubmission(repos, {
      provider: "usersubmission",
      externalId: "jinx--20260813-1200--u1",
    });
    expect(reopen).not.toHaveBeenCalled();
  });
});
