import type { EmailNotificationPreference } from "@openrift/shared/types";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { signUnsubscribeToken } from "../emails/unsubscribe-token.js";
import { applyUnsubscribe, previewUnsubscribe } from "./unsubscribe.js";

const SECRET = "test-secret-key";
const USER_ID = "a0000000-0001-4000-a000-000000000001";

function makeRepos(emailNotifications: EmailNotificationPreference | undefined) {
  const upsert = vi.fn().mockResolvedValue({});
  const getEmailNotificationContext = vi
    .fn()
    .mockResolvedValue(
      emailNotifications === undefined
        ? undefined
        : { email: "u@example.com", emailVerified: true, name: "U", emailNotifications },
    );
  const repos = { userPreferences: { getEmailNotificationContext, upsert } } as unknown as Repos;
  return { repos, upsert, getEmailNotificationContext };
}

describe("previewUnsubscribe", () => {
  it("returns valid=false for a token signed with a different secret", async () => {
    const token = signUnsubscribeToken("other-secret", USER_ID, "tradeRequests");
    const { repos, getEmailNotificationContext } = makeRepos({});
    const preview = await previewUnsubscribe(repos, SECRET, token);
    expect(preview).toEqual({
      valid: false,
      channel: null,
      channelLabel: null,
      alreadyUnsubscribed: false,
    });
    expect(getEmailNotificationContext).not.toHaveBeenCalled();
  });

  it("returns valid=false for a malformed token", async () => {
    const { repos } = makeRepos({});
    const preview = await previewUnsubscribe(repos, SECRET, "not.a.token");
    expect(preview.valid).toBe(false);
  });

  it("reports the channel + label and that the request channel is still subscribed", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const { repos } = makeRepos({});
    expect(await previewUnsubscribe(repos, SECRET, token)).toEqual({
      valid: true,
      channel: "tradeRequests",
      channelLabel: "trade-request emails",
      alreadyUnsubscribed: false,
    });
  });

  it("flags tradeRequests as already unsubscribed when explicitly off", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const { repos } = makeRepos({ tradeRequests: false });
    const preview = await previewUnsubscribe(repos, SECRET, token);
    expect(preview.alreadyUnsubscribed).toBe(true);
  });

  it("treats the opt-in digest as already unsubscribed unless explicitly on", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
    const offPreview = await previewUnsubscribe(makeRepos({}).repos, SECRET, token);
    expect(offPreview.alreadyUnsubscribed).toBe(true);

    const onPreview = await previewUnsubscribe(
      makeRepos({ tradeMatches: true }).repos,
      SECRET,
      token,
    );
    expect(onPreview.alreadyUnsubscribed).toBe(false);
  });

  it("reads the opt-in admin channel against its own default, not the request one", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "cardSubmissions");
    // Opt-in, so an untouched preference already delivers nothing — reading it
    // through the opt-out request gate would have claimed it was still on.
    const offPreview = await previewUnsubscribe(makeRepos({}).repos, SECRET, token);
    expect(offPreview).toEqual({
      valid: true,
      channel: "cardSubmissions",
      channelLabel: "card submission alerts",
      alreadyUnsubscribed: true,
    });

    const onPreview = await previewUnsubscribe(
      makeRepos({ cardSubmissions: true }).repos,
      SECRET,
      token,
    );
    expect(onPreview.alreadyUnsubscribed).toBe(false);
  });

  it("reads the opt-out status channel against its own default", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeStatus");
    const onPreview = await previewUnsubscribe(makeRepos({}).repos, SECRET, token);
    expect(onPreview.alreadyUnsubscribed).toBe(false);

    const offPreview = await previewUnsubscribe(
      makeRepos({ tradeStatus: false }).repos,
      SECRET,
      token,
    );
    expect(offPreview.alreadyUnsubscribed).toBe(true);
  });
});

describe("applyUnsubscribe", () => {
  it("returns null and does not write for an invalid token", async () => {
    const { repos, upsert } = makeRepos({});
    expect(await applyUnsubscribe(repos, SECRET, "not.a.token")).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("flips the named channel off and preserves the sibling channel", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const { repos, upsert } = makeRepos({ tradeMatches: true, tradeRequests: true });
    const result = await applyUnsubscribe(repos, SECRET, token);
    expect(result).toEqual({ channel: "tradeRequests", channelLabel: "trade-request emails" });
    expect(upsert).toHaveBeenCalledWith(USER_ID, {
      emailNotifications: { tradeMatches: true, tradeRequests: false },
    });
  });

  it("is idempotent: re-applying when already off still writes false (no-op)", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const { repos, upsert } = makeRepos({ tradeRequests: false });
    await applyUnsubscribe(repos, SECRET, token);
    expect(upsert).toHaveBeenCalledWith(USER_ID, {
      emailNotifications: { tradeRequests: false },
    });
  });

  it("works when the user has no stored preferences yet", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
    const { repos, upsert } = makeRepos(undefined);
    expect(await applyUnsubscribe(repos, SECRET, token)).toEqual({
      channel: "tradeMatches",
      channelLabel: "the daily match digest",
    });
    expect(upsert).toHaveBeenCalledWith(USER_ID, {
      emailNotifications: { tradeMatches: false },
    });
  });
});
