import { describe, expect, it } from "vitest";

import type { GroupApprovedEmailInput, GroupJoinRequestEmailInput } from "./group-emails.js";
import { buildGroupApprovedEmail, buildGroupJoinRequestEmail } from "./group-emails.js";

const INPUT: GroupJoinRequestEmailInput = {
  recipientName: "Riven",
  requesterName: "Garen",
  groupName: "Summoner Skirmish",
  membersUrl: "https://openrift.app/groups/summoner-skirmish/members",
  unsubscribeUrl: "https://openrift.app/unsubscribe?token=abc",
};

describe("buildGroupJoinRequestEmail", () => {
  it("names the group in the subject and both people in the body", () => {
    const { subject, html } = buildGroupJoinRequestEmail(INPUT);

    expect(subject).toBe("Join request for Summoner Skirmish");
    expect(html).toContain("Hi Riven,");
    expect(html).toContain("Garen");
    expect(html).toContain("Summoner Skirmish");
  });

  it("falls back to a bare greeting when the recipient has no name", () => {
    const { html } = buildGroupJoinRequestEmail({ ...INPUT, recipientName: null });

    expect(html).toContain("Hi,");
  });

  it("says 'Someone' when the requester has no display name", () => {
    const { html } = buildGroupJoinRequestEmail({ ...INPUT, requesterName: null });

    expect(html).toContain("<strong>Someone</strong>");
  });

  it("links the button at the members tab and the footer at the unsubscribe page", () => {
    const { html } = buildGroupJoinRequestEmail(INPUT);

    expect(html).toContain('href="https://openrift.app/groups/summoner-skirmish/members"');
    expect(html).toContain('href="https://openrift.app/unsubscribe?token=abc"');
    expect(html).toContain("Group join requests");
  });

  it("escapes names that contain markup", () => {
    const { html } = buildGroupJoinRequestEmail({
      ...INPUT,
      requesterName: "<script>alert(1)</script>",
      groupName: "Rift & Co",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Rift &amp; Co");
  });
});

const APPROVED: GroupApprovedEmailInput = {
  recipientName: "Garen",
  groupName: "Summoner Skirmish",
  groupUrl: "https://openrift.app/groups/summoner-skirmish",
  manageUrl: "https://openrift.app/groups/summoner-skirmish/manage",
  unsubscribeUrl: "https://openrift.app/unsubscribe?token=abc",
};

describe("buildGroupApprovedEmail", () => {
  it("names the group in the subject and greets the new member", () => {
    const { subject, html } = buildGroupApprovedEmail(APPROVED);

    expect(subject).toBe("You're in: Summoner Skirmish");
    expect(html).toContain("Hi Garen,");
    expect(html).toContain("Summoner Skirmish");
  });

  it("falls back to a bare greeting when the member has no name", () => {
    const { html } = buildGroupApprovedEmail({ ...APPROVED, recipientName: null });

    expect(html).toContain("Hi,");
  });

  it("says what the group is for, so the mail is a reason to come back", () => {
    const { html } = buildGroupApprovedEmail(APPROVED);

    expect(html).toContain("wishlist");
    expect(html).toContain("Trade matches");
  });

  it("links both the group and the manage page, where sharing is chosen", () => {
    const { html } = buildGroupApprovedEmail(APPROVED);

    expect(html).toContain('href="https://openrift.app/groups/summoner-skirmish"');
    expect(html).toContain('href="https://openrift.app/groups/summoner-skirmish/manage"');
    expect(html).toContain("Nothing of yours is visible yet");
  });

  it("carries its own unsubscribe channel, separate from join requests", () => {
    const { html } = buildGroupApprovedEmail(APPROVED);

    expect(html).toContain('href="https://openrift.app/unsubscribe?token=abc"');
    expect(html).toContain("Group welcome emails");
    expect(html).not.toContain("Group join requests");
  });

  it("escapes a group name that contains markup", () => {
    const { html } = buildGroupApprovedEmail({
      ...APPROVED,
      groupName: "<script>alert(1)</script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
