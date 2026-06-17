// oxlint-disable-next-line import/no-nodejs-modules -- HMAC signing is server-only and Node's crypto is the right primitive
import { createHmac, timingSafeEqual } from "node:crypto";

import type { EmailNotificationChannel } from "@openrift/shared/types";

/**
 * Self-describing, stateless one-click-unsubscribe token (ADR-030). It is an
 * HMAC of `(userId, channel)` signed with the app secret, so no table is
 * needed: the link both names which preference to flip and proves it was issued
 * by us. The token is opaque to the recipient and tamper-evident.
 */

const VALID_CHANNELS: readonly EmailNotificationChannel[] = ["tradeMatches", "tradeRequests"];

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Builds an unsubscribe token for a single channel.
 * @returns The `userId.channel.signature` token (all parts base64url-safe).
 */
export function signUnsubscribeToken(
  secret: string,
  userId: string,
  channel: EmailNotificationChannel,
): string {
  const payload = `${base64url(userId)}.${channel}`;
  return `${payload}.${sign(secret, payload)}`;
}

/**
 * Verifies an unsubscribe token and recovers its `(userId, channel)`.
 * @returns The decoded fields, or `null` if the token is malformed, names an
 *   unknown channel, or the signature does not match.
 */
export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { userId: string; channel: EmailNotificationChannel } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [encodedUserId, channel, signature] = parts;
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
