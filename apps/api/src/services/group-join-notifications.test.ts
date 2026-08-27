import type { Logger } from "@openrift/shared/logger";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { GroupJoinRequest } from "./group-join-notifications.js";
import { notifyAdminsOfGroupJoinRequest } from "./group-join-notifications.js";
import type { TradeEmailDeps } from "./trade-notifications.js";

const OWNER = { userId: "owner-1", email: "owner@example.com", name: "Riven" };

const REQUEST: GroupJoinRequest = {
  groupId: "group-1",
  groupSlug: "summoner-skirmish",
  groupName: "Summoner Skirmish",
  requesterUserId: "user-1",
};

function makeRepos(recipients: { userId: string; email: string; name: string | null }[]) {
  const listGroupJoinRequestRecipients = vi.fn().mockResolvedValue(recipients);
  const findById = vi
    .fn()
    .mockResolvedValue({ id: "user-1", name: "Garen", email: "joiner@example.com" });
  const repos = {
    userPreferences: { listGroupJoinRequestRecipients },
    users: { findById },
  } as unknown as Repos;
  return { repos, listGroupJoinRequestRecipients, findById };
}

function makeDeps(sendEmail = vi.fn().mockResolvedValue(undefined)): {
  deps: TradeEmailDeps;
  sendEmail: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const error = vi.fn();
  const deps = {
    sendEmail,
    appBaseUrl: "https://openrift.app",
    unsubscribeSecret: "test-secret-key",
    log: { error } as unknown as Logger,
  } as TradeEmailDeps;
  return { deps, sendEmail, error };
}

describe("notifyAdminsOfGroupJoinRequest", () => {
  it("emails each group admin separately, so addresses are never shared", async () => {
    const { repos } = makeRepos([
      OWNER,
      { userId: "admin-2", email: "second@example.com", name: null },
    ]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfGroupJoinRequest(repos, REQUEST, deps);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [first, second] = sendEmail.mock.calls.map(([args]) => args);
    expect(first.to).toBe("owner@example.com");
    expect(second.to).toBe("second@example.com");
    expect(first.subject).toContain("Summoner Skirmish");
    expect(first.html).toContain("Garen");
    expect(first.listUnsubscribeUrl).not.toBe(second.listUnsubscribeUrl);
  });

  it("links to the group's members tab, where the approve buttons are", async () => {
    const { repos } = makeRepos([OWNER]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfGroupJoinRequest(repos, REQUEST, deps);

    expect(sendEmail.mock.calls[0][0].html).toContain(
      "https://openrift.app/groups/summoner-skirmish/members",
    );
  });

  it("never puts the requester's email address in the body", async () => {
    const { repos } = makeRepos([OWNER]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfGroupJoinRequest(repos, REQUEST, deps);

    expect(sendEmail.mock.calls[0][0].html).not.toContain("joiner@example.com");
  });

  it("sends nothing when every admin has opted out", async () => {
    const { repos, findById } = makeRepos([]);
    const { deps, sendEmail } = makeDeps();

    await notifyAdminsOfGroupJoinRequest(repos, REQUEST, deps);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
  });

  it("sends nothing when no email deps are wired (SMTP-less env)", async () => {
    const { repos, listGroupJoinRequestRecipients } = makeRepos([OWNER]);

    await notifyAdminsOfGroupJoinRequest(repos, REQUEST);

    expect(listGroupJoinRequestRecipients).not.toHaveBeenCalled();
  });

  it("keeps mailing the other admins when one send throws", async () => {
    const { repos } = makeRepos([
      OWNER,
      { userId: "admin-2", email: "second@example.com", name: null },
    ]);
    const sendEmail = vi
      .fn()
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(undefined);
    const { deps, error } = makeDeps(sendEmail);

    await notifyAdminsOfGroupJoinRequest(repos, REQUEST, deps);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("never throws when the recipient lookup fails", async () => {
    const repos = {
      userPreferences: {
        listGroupJoinRequestRecipients: vi.fn().mockRejectedValue(new Error("db down")),
      },
      users: { findById: vi.fn() },
    } as unknown as Repos;
    const { deps, sendEmail, error } = makeDeps();

    await expect(notifyAdminsOfGroupJoinRequest(repos, REQUEST, deps)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
