import type { Logger } from "@openrift/shared/logger";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { IngestCard } from "../routes/admin/cards/schemas.js";
import type {
  CardSubmissionAlert,
  CardSubmissionEmailDeps,
} from "./card-submission-notifications.js";
import { notifyAdminsOfCardSubmission } from "./card-submission-notifications.js";

const ADMIN = { userId: "admin-1", email: "admin@example.com", name: "Riven" };

const CARD = {
  name: "Azir, Emperor of the Sands",
  printings: [
    {
      public_code: "OGN-123/298",
      set_name: "Origins",
      language: "en",
      finish: "foil",
    },
  ],
} as unknown as IngestCard;

const SUBMISSION: CardSubmissionAlert = {
  submitterUserId: "user-1",
  card: CARD,
  note: "The art is from the alternate printing",
};

function makeRepos(recipients: { userId: string; email: string; name: string | null }[]) {
  const listCardSubmissionRecipients = vi.fn().mockResolvedValue(recipients);
  const findById = vi
    .fn()
    .mockResolvedValue({ id: "user-1", name: "Garen", email: "contributor@example.com" });
  const repos = {
    userPreferences: { listCardSubmissionRecipients },
    users: { findById },
  } as unknown as Repos;
  return { repos, listCardSubmissionRecipients, findById };
}

function makeDeps(sendEmail = vi.fn().mockResolvedValue(undefined)): {
  deps: CardSubmissionEmailDeps;
  sendEmail: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const error = vi.fn();
  const deps = {
    sendEmail,
    appBaseUrl: "https://openrift.app",
    unsubscribeSecret: "test-secret-key",
    log: { error } as unknown as Logger,
  } as CardSubmissionEmailDeps;
  return { deps, sendEmail, error };
}

describe("notifyAdminsOfCardSubmission", () => {
  it("emails each opted-in admin separately, so addresses are never shared", async () => {
    const { repos } = makeRepos([
      ADMIN,
      { userId: "admin-2", email: "second@example.com", name: null },
    ]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfCardSubmission(repos, SUBMISSION, deps);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [first, second] = sendEmail.mock.calls.map(([args]) => args);
    expect(first.to).toBe("admin@example.com");
    expect(second.to).toBe("second@example.com");
    expect(first.subject).toContain("Azir, Emperor of the Sands");
    expect(first.html).toContain("Garen");
    expect(first.html).toContain("The art is from the alternate printing");
    // Each recipient gets their own one-click link (the token is per user).
    expect(first.listUnsubscribeUrl).not.toBe(second.listUnsubscribeUrl);
  });

  it("links to the candidates tab filtered to user submissions", async () => {
    const { repos } = makeRepos([ADMIN]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfCardSubmission(repos, SUBMISSION, deps);

    expect(sendEmail.mock.calls[0][0].html).toContain(
      "https://openrift.app/admin/cards?tab=candidates&amp;source=usersubmission",
    );
  });

  it("sends nothing when no admin has opted in", async () => {
    const { repos, findById } = makeRepos([]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfCardSubmission(repos, SUBMISSION, deps);

    expect(sendEmail).not.toHaveBeenCalled();
    // Not even the submitter lookup runs — there is nobody to address.
    expect(findById).not.toHaveBeenCalled();
  });

  it("sends nothing when no email deps are wired (SMTP-less env)", async () => {
    const { repos, listCardSubmissionRecipients } = makeRepos([ADMIN]);

    await notifyAdminsOfCardSubmission(repos, SUBMISSION);

    expect(listCardSubmissionRecipients).not.toHaveBeenCalled();
  });

  it("keeps mailing the other admins when one send throws", async () => {
    const { repos } = makeRepos([
      ADMIN,
      { userId: "admin-2", email: "second@example.com", name: null },
    ]);
    const sendEmail = vi
      .fn()
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(undefined);
    const { deps, error } = makeDeps(sendEmail);

    await notifyAdminsOfCardSubmission(repos, SUBMISSION, deps);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("never throws when the recipient lookup fails", async () => {
    const repos = {
      userPreferences: {
        listCardSubmissionRecipients: vi.fn().mockRejectedValue(new Error("db down")),
      },
      users: { findById: vi.fn() },
    } as unknown as Repos;
    const { deps, sendEmail, error } = makeDeps();

    await expect(notifyAdminsOfCardSubmission(repos, SUBMISSION, deps)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("falls back to the submitter id when their account row is gone", async () => {
    const { repos, findById } = makeRepos([ADMIN]);
    findById.mockResolvedValue(undefined);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfCardSubmission(repos, SUBMISSION, deps);

    expect(sendEmail.mock.calls[0][0].html).toContain("user-1");
  });
});
