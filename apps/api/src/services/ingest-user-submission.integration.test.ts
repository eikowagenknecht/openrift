import type { CardSubmissionInput } from "@openrift/shared/contracts/card-submissions";
import { beforeEach, describe, expect, it } from "vitest";

import { createTransact } from "../deps.js";
import { createTestContext } from "../test/integration-context.js";
import {
  buildUserSubmissionCard,
  formatSubmissionDateStamp,
  ingestUserSubmission,
  USER_SUBMISSION_PROVIDER,
} from "./ingest-user-submission.js";

// ---------------------------------------------------------------------------
// Integration tests: ingestUserSubmission service (ADR-036).
//
// The point of the dedicated service is that, unlike ingestCandidates, it never
// full-replaces the provider — two users (or one user twice) must coexist under
// the shared "usersubmission" provider. These tests guard that property.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0022-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

function submission(slug: string, note: string | null): CardSubmissionInput {
  return {
    slug,
    card: {
      name: `Test ${slug}`,
      types: ["unit"],
      super_types: [],
      domains: ["fury"],
      might: 2,
      energy: 1,
      power: 1,
      might_bonus: null,
      tags: [],
    },
    printings: [{ public_code: "US-001/100", finish: "normal", language: "EN" }],
    submissionNote: note,
  };
}

async function submit(
  transact: ReturnType<typeof createTransact>,
  input: CardSubmissionInput,
  now: Date,
) {
  const card = buildUserSubmissionCard(input, USER_ID, formatSubmissionDateStamp(now));
  return ingestUserSubmission(transact, {
    userId: USER_ID,
    submissionNote: input.submissionNote ?? null,
    card,
    now,
  });
}

describe.skipIf(!ctx)("ingestUserSubmission integration", () => {
  const { db } = ctx!;
  const transact = createTransact(db);

  beforeEach(async () => {
    await db
      .deleteFrom("candidatePrintings")
      .where(
        "candidateCardId",
        "in",
        db
          .selectFrom("candidateCards")
          .select("id")
          .where("provider", "=", USER_SUBMISSION_PROVIDER)
          .where("submittedByUserId", "=", USER_ID),
      )
      .execute();
    await db
      .deleteFrom("candidateCards")
      .where("provider", "=", USER_SUBMISSION_PROVIDER)
      .where("submittedByUserId", "=", USER_ID)
      .execute();
  });

  it("stages a submission with submitter attribution and its printing", async () => {
    const result = await submit(
      transact,
      submission("alpha", "spotted in the OGN set list"),
      new Date(),
    );
    expect(result.status).toBe("ok");

    const rows = await db
      .selectFrom("candidateCards")
      .selectAll()
      .where("provider", "=", USER_SUBMISSION_PROVIDER)
      .where("submittedByUserId", "=", USER_ID)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Test alpha");
    expect(rows[0].submissionNote).toBe("spotted in the OGN set list");

    const printings = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", rows[0].id)
      .execute();
    expect(printings).toHaveLength(1);
    expect(printings[0].shortCode).toBe("US-001");
  });

  it("keeps earlier submissions when a new one arrives (no provider full-replace)", async () => {
    const first = await submit(transact, submission("alpha", null), new Date());
    const second = await submit(transact, submission("beta", null), new Date());
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");

    const rows = await db
      .selectFrom("candidateCards")
      .select("name")
      .where("provider", "=", USER_SUBMISSION_PROVIDER)
      .where("submittedByUserId", "=", USER_ID)
      .execute();
    const names = rows.map((r: { name: string }) => r.name).toSorted();
    expect(names).toEqual(["Test alpha", "Test beta"]);
  });

  it("enforces the daily cap under concurrent submissions (advisory lock)", async () => {
    // Discover the cap from the rate_limited payload instead of importing the
    // (deliberately unexported) constant: flood past any plausible limit, read
    // `limit` back, then reset to exactly one below it.
    const seedRows = (count: number, offset: number) =>
      db
        .insertInto("candidateCards")
        .values(
          Array.from({ length: count }, (_, index) => ({
            provider: USER_SUBMISSION_PROVIDER,
            externalId: `seed--${offset + index}`,
            name: `Seed ${offset + index}`,
            types: ["unit"],
            superTypes: [],
            domains: ["fury"],
            tags: [],
            submittedByUserId: USER_ID,
          })),
        )
        .execute();

    await seedRows(500, 0);
    const flooded = await submit(transact, submission("over-cap", null), new Date());
    expect(flooded.status).toBe("rate_limited");
    const limit = flooded.status === "rate_limited" ? flooded.limit : 0;
    expect(limit).toBeGreaterThan(0);

    await db
      .deleteFrom("candidateCards")
      .where("provider", "=", USER_SUBMISSION_PROVIDER)
      .where("submittedByUserId", "=", USER_ID)
      .execute();
    await seedRows(limit - 1, 1000);

    // One slot left. Five concurrent submissions race for it: without the
    // pg_advisory_xact_lock they all read the same count and all pass; with
    // it they serialize and exactly one lands.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        submit(transact, submission(`race-${index}`, null), new Date()),
      ),
    );
    const okCount = results.filter((r) => r.status === "ok").length;
    const rateLimitedCount = results.filter((r) => r.status === "rate_limited").length;
    expect(okCount).toBe(1);
    expect(rateLimitedCount).toBe(4);

    const remaining = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", USER_SUBMISSION_PROVIDER)
      .where("submittedByUserId", "=", USER_ID)
      .execute();
    expect(remaining).toHaveLength(limit);
  });
});
