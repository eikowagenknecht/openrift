import { describe, expect, it } from "vitest";

import type { GroupJoinRequestEmailInput } from "./group-emails.js";
import { buildGroupJoinRequestEmail } from "./group-emails.js";

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
