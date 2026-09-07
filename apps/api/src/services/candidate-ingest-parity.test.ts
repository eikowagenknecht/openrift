import type { IngestCard } from "@openrift/shared/contracts/admin/card-mutations";
import type { CardSubmissionInput } from "@openrift/shared/contracts/card-submissions";
/* oxlint-disable no-restricted-imports -- api has no @/ alias */
import { formatCompactUtcStamp } from "@openrift/shared/format-date";
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { ingestCandidates } from "./ingest-candidates.js";
import { buildUserSubmissionCard, ingestUserSubmission } from "./ingest-user-submission.js";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-07-02T09:00:00.000Z");
const LIVE_PRINTING_ID = "printing-uuid";

const LIVE_PRINTING = {
  id: LIVE_PRINTING_ID,
  shortCode: "OGN-066",
  finish: "foil",
  markerSlugs: [],
  language: "EN",
};

function submission(printing: Record<string, unknown> = {}): CardSubmissionInput {
  return {
    slug: "ahri-alluring",
    card: {
      name: "Ahri, Alluring",
      types: ["unit"],
      super_types: ["champion"],
      domains: ["calm"],
      might: 4,
      energy: 5,
      power: 1,
      might_bonus: null,
      tags: [],
    },
    printings: [
      {
        public_code: "OGN-066/298",
        set_id: "ogn",
        set_name: "Origins",
        rarity: "rare",
        finish: "foil",
        language: "EN",
        ...printing,
      },
    ],
    submissionNote: null,
  };
}

interface Catalog {
  printings?: (typeof LIVE_PRINTING)[];
  cardNorms?: { id: string; normName: string }[];
  linkOverrides?: { externalId: string; finish: string; provider: string; printingId: string }[];
}

async function linkedPrintingIds(
  catalog: Catalog,
  run: (transact: Transact) => Promise<unknown>,
): Promise<(string | null)[]> {
  const insertCandidatePrinting = vi.fn().mockResolvedValue(undefined);
  const repos = {
    ingest: {
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([]),
      ignoredCandidateCards: vi.fn().mockResolvedValue([]),
      ignoredCandidatePrintings: vi.fn().mockResolvedValue([]),
      allCardNorms: vi
        .fn()
        .mockResolvedValue(catalog.cardNorms ?? [{ id: "card-uuid", normName: "ahrialluring" }]),
      allCardNameAliases: vi.fn().mockResolvedValue([]),
      allPrintingKeys: vi.fn().mockResolvedValue(catalog.printings ?? [LIVE_PRINTING]),
      allPrintingLinkOverrides: vi.fn().mockResolvedValue(catalog.linkOverrides ?? []),
      insertCandidateCard: vi.fn().mockResolvedValue("new-cc-id"),
      updateCandidateCard: vi.fn().mockResolvedValue(undefined),
      insertCandidatePrinting,
      updateCandidatePrinting: vi.fn().mockResolvedValue(undefined),
      deleteCandidateCards: vi.fn().mockResolvedValue(undefined),
      deleteCandidatePrintings: vi.fn().mockResolvedValue(undefined),
      lockUserSubmissions: vi.fn().mockResolvedValue(undefined),
      countRecentSubmissionsByUser: vi.fn().mockResolvedValue(0),
    },
    cardSubmissions: {
      countRecentByUser: vi.fn().mockResolvedValue(0),
      liveSnapshot: vi.fn().mockResolvedValue({
        snapshot: { card: null, printings: new Map() },
        cardSlug: null,
      }),
      insert: vi.fn().mockResolvedValue("new-submission-id"),
    },
  } as unknown as Repos;

  await run(((fn: (r: Repos) => Promise<unknown>) => fn(repos)) as Transact);

  return insertCandidatePrinting.mock.calls.map(
    (call) => (call[0] as { printingId: string | null }).printingId,
  );
}

async function bothPaths(input: CardSubmissionInput, catalog: Catalog = {}) {
  const card: IngestCard = buildUserSubmissionCard(input, USER_ID, formatCompactUtcStamp(NOW));

  const [submissionIds, batchIds] = await Promise.all([
    linkedPrintingIds(catalog, (transact) =>
      ingestUserSubmission(transact, { userId: USER_ID, submissionNote: null, card, now: NOW }),
    ),
    linkedPrintingIds(catalog, (transact) => ingestCandidates(transact, "provider", [card])),
  ]);

  expect(submissionIds).toHaveLength(1);
  expect(batchIds).toHaveLength(1);
  return { submission: submissionIds[0], batch: batchIds[0], card };
}

describe("candidate ingest link parity", () => {
  it("links the same live printing from both entry points", async () => {
    const { submission: fromSubmission, batch } = await bothPaths(submission());
    expect(fromSubmission).toBe(LIVE_PRINTING_ID);
    expect(batch).toBe(fromSubmission);
  });

  it("links a lowercase public_code from both entry points", async () => {
    const { submission: fromSubmission, batch } = await bothPaths(
      submission({ public_code: "ogn-066/298" }),
    );
    expect(fromSubmission).toBe(LIVE_PRINTING_ID);
    expect(batch).toBe(fromSubmission);
  });

  it("links without a rarity from both entry points", async () => {
    const { submission: fromSubmission, batch } = await bothPaths(
      submission({ rarity: undefined }),
    );
    expect(fromSubmission).toBe(LIVE_PRINTING_ID);
    expect(batch).toBe(fromSubmission);
  });

  it("leaves both unlinked when the card name matches nothing", async () => {
    const { submission: fromSubmission, batch } = await bothPaths(submission(), { cardNorms: [] });
    expect(fromSubmission).toBeNull();
    expect(batch).toBeNull();
  });

  it("leaves both unlinked without a finish", async () => {
    const { submission: fromSubmission, batch } = await bothPaths(
      submission({ finish: undefined }),
    );
    expect(fromSubmission).toBeNull();
    expect(batch).toBeNull();
  });

  it("applies a manual link override from both entry points", async () => {
    const built = buildUserSubmissionCard(submission(), USER_ID, formatCompactUtcStamp(NOW));
    const { submission: fromSubmission, batch } = await bothPaths(submission(), {
      printings: [],
      // '' provider means a pre-scoping legacy row (wildcard, matches any provider).
      linkOverrides: [
        {
          externalId: built.printings[0]!.external_id,
          finish: "foil",
          provider: "",
          printingId: "override-uuid",
        },
      ],
    });
    expect(fromSubmission).toBe("override-uuid");
    expect(batch).toBe(fromSubmission);
  });
});
