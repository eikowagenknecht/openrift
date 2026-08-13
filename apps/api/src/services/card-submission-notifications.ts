import type { Logger } from "@openrift/shared/logger";

import type { Repos } from "../deps.js";
import type { createEmailSender } from "../email.js";
import { buildCardSubmissionAlertEmail } from "../emails/card-submission-emails.js";
import type { CardSubmissionPrintingLine } from "../emails/card-submission-emails.js";
import { buildUnsubscribeUrls } from "../emails/unsubscribe-token.js";
import type { IngestCard } from "../routes/admin/cards/schemas.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/** Dependencies the admin card-submission alert needs beyond `repos` (ADR-036). */
export interface CardSubmissionEmailDeps {
  sendEmail: SendEmail;
  /** Web origin for the review deep link + the unsubscribe route (BETTER_AUTH_URL). */
  appBaseUrl: string;
  /** App secret used to sign the stateless unsubscribe token. */
  unsubscribeSecret: string;
  log: Logger;
}

/** What the route knows about a submission that just landed. */
export interface CardSubmissionAlert {
  /** Who submitted it — resolved to a name + email for the email body. */
  submitterUserId: string;
  /** The mapped candidate card, the same one that was just ingested. */
  card: IngestCard;
  /** The submitter's free-text note, or null when they left it empty. */
  note: string | null;
}

/**
 * The admin candidates tab, filtered to in-app user submissions — where the
 * email's button lands, so the row is one click away rather than behind two
 * filter clicks.
 * @returns The absolute review URL.
 */
function reviewUrl(appBaseUrl: string): string {
  return `${appBaseUrl}/admin/cards?tab=candidates&source=usersubmission`;
}

/** @returns The submission's printings in the shape the email builder wants. */
function printingLines(card: IngestCard): CardSubmissionPrintingLine[] {
  return card.printings.map((printing) => ({
    publicCode: printing.public_code,
    setName: printing.set_name,
    language: printing.language,
    finish: printing.finish,
  }));
}

/**
 * Emails every admin who opted into the card-submission channel that a new
 * in-app submission is waiting for review (ADR-036).
 *
 * Opt-in per admin and default off, so promoting a second admin never starts
 * mailing them someone else's review queue — the toggle lives in their profile.
 *
 * Best-effort and side-effect-only: it never throws, and a failed send to one
 * admin does not stop the others. The caller invokes it after the candidate row
 * has committed and outside any transaction, so a mail failure can never roll
 * back or 500 the submission.
 */
export async function notifyAdminsOfCardSubmission(
  repos: Repos,
  submission: CardSubmissionAlert,
  deps?: CardSubmissionEmailDeps,
): Promise<void> {
  // No SMTP wired (tests, an SMTP-less env): nothing to send.
  if (deps === undefined) {
    return;
  }

  try {
    const recipients = await repos.userPreferences.listCardSubmissionRecipients();
    if (recipients.length === 0) {
      return;
    }

    const submitter = await repos.users.findById(submission.submitterUserId);
    const url = reviewUrl(deps.appBaseUrl);
    const printings = printingLines(submission.card);

    for (const recipient of recipients) {
      const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
        deps.appBaseUrl,
        deps.unsubscribeSecret,
        recipient.userId,
        "cardSubmissions",
      );
      const { subject, html } = buildCardSubmissionAlertEmail({
        recipientName: recipient.name,
        submitterName: submitter?.name ?? null,
        // The submitter row is gone only if the account vanished between the
        // insert and here; the id keeps the email useful either way.
        submitterEmail: submitter?.email ?? submission.submitterUserId,
        cardName: submission.card.name,
        printings,
        note: submission.note,
        reviewUrl: url,
        unsubscribeUrl: pageUrl,
      });

      // One send per admin rather than a shared To: line, so admins never see
      // each other's addresses. A failure is logged and the loop continues.
      try {
        await deps.sendEmail({
          to: recipient.email,
          subject,
          html,
          listUnsubscribeUrl: oneClickUrl,
        });
      } catch (error) {
        deps.log.error(
          { err: error, recipientUserId: recipient.userId },
          "Failed to send card-submission admin email",
        );
      }
    }
  } catch (error) {
    deps.log.error(
      { err: error, submitterUserId: submission.submitterUserId },
      "Failed to notify admins of a card submission",
    );
  }
}
