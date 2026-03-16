import { createLogger } from "@openrift/shared/logger";
import { createTransport } from "nodemailer";

import type { Config } from "./types.js";

const log = createLogger("email");

export function createEmailSender(smtp: Config["smtp"]) {
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
  }: {
    to: string;
    subject: string;
    html: string;
  }) {
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
      });
    } catch (error) {
      log.error({ to, err: error }, "Failed to send email");
      throw error;
    }
  };
}

export type SendEmail = ReturnType<typeof createEmailSender>;
