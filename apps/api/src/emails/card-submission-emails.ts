import { emailButton, escapeHtml, MUTED_TEXT, renderEmailLayout } from "./layout.js";

/*
 * Builder for the admin card-submission alert (ADR-036). Pure, like the trade
 * builders: it takes already-resolved data plus a pre-computed review URL and
 * returns `{ subject, html }`. Recipient selection, the opt-in gate and the send
 * live in the `card-submission-notifications` service.
 */

/** Why the recipient is getting this — it is not trading activity. */
const FOOTER_NOTE = "You're receiving this because you're an OpenRift admin.";

/** One submitted printing, as much of it as the contribution form captured. */
export interface CardSubmissionPrintingLine {
  publicCode: string | null;
  setName: string | null;
  language: string | null;
  finish: string | null;
}

export interface CardSubmissionAlertEmailInput {
  /** Display name of the admin receiving the alert; may be null. */
  recipientName: string | null;
  /** Display name of the submitter; may be null (falls back to their email). */
  submitterName: string | null;
  submitterEmail: string;
  cardName: string;
  printings: CardSubmissionPrintingLine[];
  /** The submitter's free-text note, or null when they left it empty. */
  note: string | null;
  /** Deep link to the admin candidates tab, filtered to user submissions. */
  reviewUrl: string;
  /** One-click unsubscribe link for the `cardSubmissions` channel. */
  unsubscribeUrl: string;
}

/**
 * Renders one printing as "OGN-123 · Origins · foil · EN", dropping whichever
 * parts the submission left blank.
 * @returns The escaped HTML for a single list item.
 */
function printingLine(printing: CardSubmissionPrintingLine): string {
  const parts = [printing.publicCode, printing.setName, printing.finish, printing.language].filter(
    (part): part is string => Boolean(part),
  );
  // Every part optional means a line can come out empty; say so rather than
  // rendering a blank bullet the admin can't interpret.
  const label = parts.length > 0 ? parts.join(" · ") : "Printing with no details";
  return `<li style="margin:0 0 4px;">${escapeHtml(label)}</li>`;
}

/**
 * Builds the "someone submitted a card" alert sent to opted-in admins.
 * @returns The subject line and full HTML body.
 */
export function buildCardSubmissionAlertEmail(input: CardSubmissionAlertEmailInput): {
  subject: string;
  html: string;
} {
  const submitter = input.submitterName ?? input.submitterEmail;
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";
  const subject = `New card submission: ${input.cardName} — OpenRift`;

  const printingsHtml =
    input.printings.length > 0
      ? `<ul style="margin:0 0 16px;padding-left:20px;">${input.printings.map((printing) => printingLine(printing)).join("")}</ul>`
      : "";

  // The note is the one field where a submitter writes free text, so it carries
  // most of the "why" — show it verbatim rather than summarizing it away.
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
