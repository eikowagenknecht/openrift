import { createLogger } from "@openrift/shared/logger";
import { createTransport } from "nodemailer";

import { config } from "./config.js";

const log = createLogger("email");

const transporter = config.smtp.configured
  ? createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    })
  : null;

if (!transporter) {
  log.warn("SMTP not configured — emails will be logged to console");
}

export async function sendEmail({
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
      from: config.smtp.from,
      to,
      subject,
      html,
    });
  } catch (error) {
    log.error({ to, err: error }, "Failed to send email");
    throw error;
  }
}
