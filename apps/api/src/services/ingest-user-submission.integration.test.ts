import type { CardSubmissionInput } from "@openrift/shared/contracts";
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
      type: "unit",
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
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const db = ctx?.db ?? (null as any);
  const transact = db ? createTransact(db) : (null as any);

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
});
