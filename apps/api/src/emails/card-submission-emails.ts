import { emailButton, escapeHtml, MUTED_TEXT, renderEmailLayout } from "./layout.js";

const FOOTER_NOTE = "You're receiving this because you're an OpenRift admin.";

export interface CardSubmissionPrintingLine {
  publicCode: string | null;
  setName: string | null;
  language: string | null;
  finish: string | null;
}

export interface CardSubmissionAlertEmailInput {
  recipientName: string | null;
  submitterName: string | null;
  submitterEmail: string;
  cardName: string;
  printings: CardSubmissionPrintingLine[];
  note: string | null;
  reviewUrl: string;
  unsubscribeUrl: string;
}

function printingLine(printing: CardSubmissionPrintingLine): string {
  const parts = [printing.publicCode, printing.setName, printing.finish, printing.language].filter(
    (part): part is string => Boolean(part),
  );
  const label = parts.length > 0 ? parts.join(" · ") : "Printing with no details";
  return `<li style="margin:0 0 4px;">${escapeHtml(label)}</li>`;
}

export function buildCardSubmissionAlertEmail(input: CardSubmissionAlertEmailInput): {
  subject: string;
  html: string;
} {
  const submitter = input.submitterName ?? input.submitterEmail;
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";
  const subject = `New card submission: ${input.cardName}`;

  const printingsHtml =
    input.printings.length > 0
      ? `<ul style="margin:0 0 16px;padding-left:20px;">${input.printings.map((printing) => printingLine(printing)).join("")}</ul>`
      : "";

  const noteHtml = input.note
    ? `<p style="margin:0 0 16px;">Their note: “${escapeHtml(input.note)}”</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(submitter)}</strong> submitted <strong>${escapeHtml(input.cardName)}</strong> for review.</p>
    ${printingsHtml}
    ${noteHtml}
    <p style="margin:0 0 20px;color:${MUTED_TEXT};font-size:12px;">Submitted by ${escapeHtml(input.submitterEmail)}</p>
    <p style="margin:0;">${emailButton("Review submissions", input.reviewUrl)}</p>
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "New card submission",
      bodyHtml,
      footerNote: FOOTER_NOTE,
      unsubscribe: { url: input.unsubscribeUrl, label: "Card submission alerts" },
    }),
  };
}
