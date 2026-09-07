import type { IngestCard } from "@openrift/shared/contracts/admin/card-mutations";
import { createLogger } from "@openrift/shared/logger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import type { CardSubmissionEmailDeps } from "./card-submission-notifications.js";
import { notifyAdminsOfCardSubmission } from "./card-submission-notifications.js";

const SUBMITTER_ID = crypto.randomUUID();
const OPTED_IN_ADMIN_ID = crypto.randomUUID();
const SILENT_ADMIN_ID = crypto.randomUUID();
const OPTED_IN_NON_ADMIN_ID = crypto.randomUUID();
const UNVERIFIED_ADMIN_ID = crypto.randomUUID();
const ALL_USER_IDS = [
  SUBMITTER_ID,
  OPTED_IN_ADMIN_ID,
  SILENT_ADMIN_ID,
  OPTED_IN_NON_ADMIN_ID,
  UNVERIFIED_ADMIN_ID,
];

const CARD = {
  name: "Integration Submission Card",
  printings: [{ public_code: "OGN-001/298", set_name: "Origins", finish: null, language: "en" }],
} as unknown as IngestCard;

const ctx = createDbContext(SUBMITTER_ID);

describe.skipIf(!ctx)("card submission admin notifications (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);

  function makeDeps(sent: { to: string; subject: string }[]): CardSubmissionEmailDeps {
    return {
      // oxlint-disable-next-line require-await -- mock matches the async sender shape
      sendEmail: async ({ to, subject }) => {
        sent.push({ to, subject });
        return undefined;
      },
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      log: createLogger("test", "silent"),
    };
  }

  beforeAll(async () => {
    await seedTestUser(db, { id: SUBMITTER_ID });
    await seedTestUser(db, { id: OPTED_IN_ADMIN_ID, isAdmin: true });
    await seedTestUser(db, { id: SILENT_ADMIN_ID, isAdmin: true });
    await seedTestUser(db, { id: OPTED_IN_NON_ADMIN_ID });
    await seedTestUser(db, { id: UNVERIFIED_ADMIN_ID, isAdmin: true, emailVerified: false });

    await repos.userPreferences.upsert(OPTED_IN_ADMIN_ID, {
      emailNotifications: { cardSubmissions: true },
    });
    await repos.userPreferences.upsert(OPTED_IN_NON_ADMIN_ID, {
      emailNotifications: { cardSubmissions: true },
    });
    await repos.userPreferences.upsert(UNVERIFIED_ADMIN_ID, {
      emailNotifications: { cardSubmissions: true },
    });
    await repos.userPreferences.upsert(SILENT_ADMIN_ID, {
      emailNotifications: { tradeMatches: true },
    });
  });

  afterAll(async () => {
    await db.deleteFrom("userPreferences").where("userId", "in", ALL_USER_IDS).execute();
    await db.deleteFrom("admins").where("userId", "in", ALL_USER_IDS).execute();
    await db.deleteFrom("users").where("id", "in", ALL_USER_IDS).execute();
  });

  it("lists only opted-in, verified admins as recipients", async () => {
    const recipients = await repos.userPreferences.listCardSubmissionRecipients();
    const ids = new Set(recipients.map((recipient) => recipient.userId));
    expect(ids.has(OPTED_IN_ADMIN_ID)).toBe(true);
    expect(ids.has(SILENT_ADMIN_ID)).toBe(false);
    expect(ids.has(OPTED_IN_NON_ADMIN_ID)).toBe(false);
    expect(ids.has(UNVERIFIED_ADMIN_ID)).toBe(false);
  });

  it("emails the opted-in admin about a submission", async () => {
    const sent: { to: string; subject: string }[] = [];
    await notifyAdminsOfCardSubmission(
      repos,
      { submitterUserId: SUBMITTER_ID, card: CARD, note: "Spotted in a promo pack" },
      makeDeps(sent),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(`test-${OPTED_IN_ADMIN_ID}@test.com`);
    expect(sent[0].subject).toContain("Integration Submission Card");
  });
});
