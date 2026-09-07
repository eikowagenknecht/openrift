import type { IngestCard } from "@openrift/shared/contracts/admin/card-mutations";
import type { Logger } from "@openrift/shared/logger";

import type { Repos } from "../../../deps.js";
import type { createEmailSender } from "../../../email.js";
import { buildCardSubmissionAlertEmail } from "../../../emails/card-submission-emails.js";
import type { CardSubmissionPrintingLine } from "../../../emails/card-submission-emails.js";
import { buildUnsubscribeUrls } from "../../../emails/unsubscribe-token.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/** Dependencies the admin card-submission alert needs beyond `repos`. */
export interface CardSubmissionEmailDeps {
  sendEmail: SendEmail;
  appBaseUrl: string;
  unsubscribeSecret: string;
  log: Logger;
}

export interface CardSubmissionAlert {
  submitterUserId: string;
  card: IngestCard;
  note: string | null;
}

function reviewUrl(appBaseUrl: string): string {
  return `${appBaseUrl}/admin/cards?tab=candidates&source=usersubmission`;
}

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
 * in-app submission is waiting for review.
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

      // Send per-admin: a shared To: line would leak other admins' addresses.
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
