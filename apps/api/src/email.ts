import { createLogger } from "@openrift/shared/logger";
import { createTransport } from "nodemailer";

import type { Config } from "./types.js";

const log = createLogger("email");

export function createEmailSender(smtp: Config["smtp"], isDev: boolean) {
  // better-auth swallows email-send failures, so missing SMTP outside dev
  // silently drops verification and password-reset mail.
  if (!smtp.configured && !isDev) {
    throw new Error(
      "SMTP is not configured (SMTP_HOST is unset) outside development. " +
        "Refusing to start: verification and password-reset emails would be silently dropped.",
    );
  }

  const transporter = smtp.configured
    ? createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      })
    : null;

  if (!transporter) {
    log.warn("SMTP not configured — emails will be logged to console");
  }

  return async function sendEmail({
    to,
    subject,
    html,
    listUnsubscribeUrl,
  }: {
    to: string;
    subject: string;
    html: string;
    listUnsubscribeUrl?: string;
  }) {
    // RFC 8058 requires both headers together, or the URL is treated as a legacy link.
    const headers = listUnsubscribeUrl
      ? {
          "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined;

    if (!transporter) {
      log.info({ to, subject }, "Email (not sent):\n%s", html);
      return;
    }

    try {
      return await transporter.sendMail({
        from: smtp.from,
        to,
        subject,
        html,
        headers,
      });
    } catch (error) {
      log.error({ to, err: error }, "Failed to send email");
      throw error;
    }
  };
}
