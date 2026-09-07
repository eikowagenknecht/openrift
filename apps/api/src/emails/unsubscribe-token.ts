// oxlint-disable-next-line import/no-nodejs-modules -- HMAC signing is server-only and Node's crypto is the right primitive
import { createHmac, timingSafeEqual } from "node:crypto";

import type { EmailNotificationChannel } from "@openrift/shared/types";

/**
 * Self-describing, stateless one-click-unsubscribe token. It is an HMAC of
 * `(userId, channel)` signed with the app secret, so no table is needed: the
 * link both names which preference to flip and proves it was issued by us.
 */

const VALID_CHANNELS: readonly EmailNotificationChannel[] = [
  "tradeMatches",
  "tradeRequests",
  "tradeStatus",
  "cardSubmissions",
  "groupJoinRequests",
  "groupApprovals",
];

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Token format: `userId.channel.signature`, all parts base64url-safe. */
export function signUnsubscribeToken(
  secret: string,
  userId: string,
  channel: EmailNotificationChannel,
): string {
  const payload = `${base64url(userId)}.${channel}`;
  return `${payload}.${sign(secret, payload)}`;
}

/**
 * Builds the two unsubscribe URLs an email needs: the human-facing
 * confirmation page on the web app (the in-body footer link, which never
 * mutates on GET) and the RFC 8058 one-click endpoint on the API (the
 * `List-Unsubscribe` header target the mail client POSTs). Both carry the same
 * single-channel token. `appBaseUrl` is the web origin; `/api/v1` is proxied to
 * the API on that same origin.
 */
export function buildUnsubscribeUrls(
  appBaseUrl: string,
  secret: string,
  userId: string,
  channel: EmailNotificationChannel,
): { pageUrl: string; oneClickUrl: string } {
  const token = encodeURIComponent(signUnsubscribeToken(secret, userId, channel));
  return {
    pageUrl: `${appBaseUrl}/unsubscribe?token=${token}`,
    oneClickUrl: `${appBaseUrl}/api/v1/unsubscribe/one-click?token=${token}`,
  };
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { userId: string; channel: EmailNotificationChannel } | null {
  const [encodedUserId, channel, signature, ...rest] = token.split(".");
  if (
    encodedUserId === undefined ||
    channel === undefined ||
    signature === undefined ||
    rest.length > 0
  ) {
    return null;
  }
  if (!VALID_CHANNELS.includes(channel as EmailNotificationChannel)) {
    return null;
  }
  const expected = sign(secret, `${encodedUserId}.${channel}`);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
    return null;
  }
  let userId: string;
  try {
    userId = Buffer.from(encodedUserId, "base64url").toString("utf-8");
  } catch {
    return null;
  }
  if (userId.length === 0) {
    return null;
  }
  return { userId, channel: channel as EmailNotificationChannel };
}
