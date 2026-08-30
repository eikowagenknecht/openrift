/*
 * Shared HTML shell for transactional emails. Plain inline-styled HTML, no
 * template engine: a header band, a content card, and a footer that
 * optionally carries a one-click unsubscribe link for the email's channel.
 * Both the trade-request and match-digest emails render through this so they
 * stay on-brand and consistent.
 */

export const BRAND = "#24705f";
const TEXT = "#18181b";
export const MUTED_TEXT = "#71717a";
const MUTED = MUTED_TEXT;
const BORDER = "#e4e4e7";
const BACKGROUND = "#f4f4f5";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function emailButton(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">${escapeHtml(label)}</a>`;
}

const DEFAULT_FOOTER_NOTE = "You're receiving this because of your trading activity on OpenRift.";

interface EmailLayoutParams {
  heading: string;
  /** Already-escaped inner HTML for the content card. */
  bodyHtml: string;
  unsubscribe?: { url: string; label: string };
  /**
   * Why the recipient is getting this mail, shown above the unsubscribe line.
   * Defaults to the trading-activity wording; non-trade emails (the admin
   * card-submission alert) pass their own.
   */
  footerNote?: string;
}

export function renderEmailLayout(params: EmailLayoutParams): string {
  const { heading, bodyHtml, unsubscribe, footerNote = DEFAULT_FOOTER_NOTE } = params;
  const unsubscribeHtml = unsubscribe
    ? `<p style="margin:12px 0 0;color:${MUTED};font-size:12px;">${escapeHtml(unsubscribe.label)} — <a href="${escapeHtml(unsubscribe.url)}" style="color:${MUTED};">unsubscribe</a>.</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BACKGROUND};">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <div style="font-size:18px;font-weight:700;color:${BRAND};margin-bottom:16px;">OpenRift</div>
      <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:24px;">
        <h1 style="margin:0 0 16px;font-size:18px;color:${TEXT};">${escapeHtml(heading)}</h1>
        <div style="color:${TEXT};font-size:14px;line-height:1.6;">${bodyHtml}</div>
      </div>
      <div style="padding:16px 4px 0;">
        <p style="margin:0;color:${MUTED};font-size:12px;">${escapeHtml(footerNote)}</p>
        ${unsubscribeHtml}
      </div>
    </div>
  </body>
</html>`;
}
