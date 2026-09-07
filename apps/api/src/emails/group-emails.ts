import { BRAND, emailButton, escapeHtml, renderEmailLayout } from "./layout.js";

const FOOTER_NOTE = "You're receiving this because you run a group on OpenRift.";

export interface GroupJoinRequestEmailInput {
  recipientName: string | null;
  requesterName: string | null;
  groupName: string;
  membersUrl: string;
  unsubscribeUrl: string;
}

/** Never includes the requester's email, only their name, matching the in-app request band. */
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

const APPROVAL_FOOTER_NOTE = "You're receiving this because you asked to join a group on OpenRift.";

export interface GroupApprovedEmailInput {
  recipientName: string | null;
  groupName: string;
  groupUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
}

export function buildGroupApprovedEmail(input: GroupApprovedEmailInput): {
  subject: string;
  html: string;
} {
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";
  const group = escapeHtml(input.groupName);
  const subject = `You're in: ${input.groupName}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 16px;">An admin approved your request, so you're now a member of <strong>${group}</strong>.</p>
    <p style="margin:0 0 8px;">What that gets you:</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li style="margin:0 0 6px;">Browse every collection, wishlist and tradelist the other members share.</li>
      <li style="margin:0 0 6px;">Trade matches: cards on your wishlist that someone in the group has spare.</li>
      <li style="margin:0 0 6px;">Follow the group's trades and activity as they happen.</li>
    </ul>
    <p style="margin:0 0 16px;">Nothing of yours is visible yet. Pick which lists and collections the group can see on the <a href="${escapeHtml(input.manageUrl)}" style="color:${BRAND};">manage page</a>.</p>
    <p style="margin:0;">${emailButton(`Open ${input.groupName}`, input.groupUrl)}</p>
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "You're in",
      bodyHtml,
      footerNote: APPROVAL_FOOTER_NOTE,
      unsubscribe: { url: input.unsubscribeUrl, label: "Group welcome emails" },
    }),
  };
}
