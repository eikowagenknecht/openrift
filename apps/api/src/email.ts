import { createTransport } from "nodemailer";

const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_SECURE !== "false",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    return await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("[email] Failed to send to", to, error);
    throw error;
  }
}
