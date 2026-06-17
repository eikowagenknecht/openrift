import type { EmailNotificationChannel } from "@openrift/shared/types";

import { verifyUnsubscribeToken } from "../../emails/unsubscribe-token.js";
import { createApiApp } from "../../openapi.js";

const CHANNEL_LABELS: Record<EmailNotificationChannel, string> = {
  tradeMatches: "the daily match digest",
  tradeRequests: "trade-request emails",
};

/**
 * A minimal standalone confirmation page (these links open in a fresh browser
 * tab and hit the API directly, so they can't boot the React app). The wordmark
 * and a primary button both link back to the OpenRift home page.
 * @returns The confirmation page's HTML document.
 */
function page(title: string, message: string, homeUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title} — OpenRift</title>
  </head>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:64px auto;padding:0 24px;">
      <a href="${homeUrl}" style="display:inline-block;font-size:18px;font-weight:700;color:#24705f;text-decoration:none;margin-bottom:16px;">OpenRift</a>
      <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#18181b;">${title}</h1>
        <p style="margin:0 0 20px;color:#18181b;font-size:14px;line-height:1.6;">${message}</p>
        <a href="${homeUrl}" style="display:inline-block;background:#24705f;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">Go to OpenRift</a>
      </div>
    </div>
  </body>
</html>`;
}

// ADR-030 one-click unsubscribe. Unauthenticated: the HMAC token is the only
// credential and is scoped to a single (userId, channel). Verifying it flips
// exactly that channel to `false`, preserving the sibling channel.
export const unsubscribeRoute = createApiApp().get("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  const config = c.get("config");
  const { userPreferences } = c.get("repos");

  const homeUrl = config.appBaseUrl || "/";
  const decoded = token ? verifyUnsubscribeToken(config.auth.secret, token) : null;
  if (decoded === null) {
    return c.html(
      page(
        "Link not valid",
        "This unsubscribe link is invalid or has expired. Nothing was changed. You can manage email notifications anytime in your profile.",
        homeUrl,
      ),
      400,
    );
  }

  // Preserve the sibling channel: read the current object, then flip just this one.
  const context = await userPreferences.getEmailNotificationContext(decoded.userId);
  const next = { ...context?.emailNotifications, [decoded.channel]: false };
  await userPreferences.upsert(decoded.userId, { emailNotifications: next });

  return c.html(
    page(
      "You're unsubscribed",
      `You'll no longer receive ${CHANNEL_LABELS[decoded.channel]}. You can turn this back on anytime in your OpenRift profile.`,
      homeUrl,
    ),
  );
});
