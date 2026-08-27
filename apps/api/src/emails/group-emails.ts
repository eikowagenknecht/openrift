import { emailButton, escapeHtml, renderEmailLayout } from "./layout.js";

/*
 * Builder for the group join-request alert. Pure, like the trade and
 * card-submission builders: it takes already-resolved data plus a pre-computed
 * link and returns `{ subject, html }`. Recipient selection, the opt-out gate
 * and the send live in the `group-join-notifications` service.
 */

const FOOTER_NOTE = "You're receiving this because you run a group on OpenRift.";

export interface GroupJoinRequestEmailInput {
  recipientName: string | null;
  requesterName: string | null;
  groupName: string;
  membersUrl: string;
  unsubscribeUrl: string;
}

/**
 * Builds the "someone asked to join your group" alert sent to its owners and
 * admins. Carries no more about the requester than the in-app request band
 * does — a name, never their email address.
 */
export function buildGroupJoinRequestEmail(input: GroupJoinRequestEmailInput): {
  subject: string;
  html: string;
} {
  const requester = escapeHtml(input.requesterName ?? "Someone");
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";
  const subject = `Join request for ${input.groupName}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 16px;"><strong>${requester}</strong> asked to join <strong>${escapeHtml(input.groupName)}</strong>. They stay outside the group until an admin approves them.</p>
    <p style="margin:0;">${emailButton("Review the request", input.membersUrl)}</p>
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "New join request",
      bodyHtml,
      footerNote: FOOTER_NOTE,
      unsubscribe: { url: input.unsubscribeUrl, label: "Group join requests" },
    }),
  };
}
