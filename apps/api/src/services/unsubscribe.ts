import type { EmailNotificationChannel, EmailNotificationPreference } from "@openrift/shared/types";
import {
  EMAIL_NOTIFICATION_CHANNEL_LABELS,
  isCardSubmissionEmailEnabled,
  isGroupJoinRequestEmailEnabled,
  isTradeMatchDigestEnabled,
  isTradeRequestEmailEnabled,
  isTradeStatusEmailEnabled,
} from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import { verifyUnsubscribeToken } from "../emails/unsubscribe-token.js";

/** A verified, read-only view of one channel for the confirmation page. */
export interface UnsubscribePreview {
  valid: boolean;
  channel: EmailNotificationChannel | null;
  channelLabel: string | null;
  alreadyUnsubscribed: boolean;
}

/** The outcome of flipping a channel off, used to render the success state. */
export interface UnsubscribeResult {
  channel: EmailNotificationChannel;
  channelLabel: string;
}

/**
 * Whether the channel is already in its "off" state, honouring the per-channel
 * defaults (`tradeMatches` and `cardSubmissions` are opt-in; the two other trade
 * channels and `groupJoinRequests` are opt-out). Used so the confirmation page
 * can say "already unsubscribed" instead of implying a change.
 * @returns true if the channel currently delivers no mail.
 */
function isChannelOff(
  channel: EmailNotificationChannel,
  prefs: EmailNotificationPreference | undefined,
): boolean {
  switch (channel) {
    case "tradeMatches": {
      return !isTradeMatchDigestEnabled(prefs);
    }
    case "tradeStatus": {
      return !isTradeStatusEmailEnabled(prefs);
    }
    case "cardSubmissions": {
      return !isCardSubmissionEmailEnabled(prefs);
    }
    case "groupJoinRequests": {
      return !isGroupJoinRequestEmailEnabled(prefs);
    }
    default: {
      return !isTradeRequestEmailEnabled(prefs);
    }
  }
}

/**
 * Decodes the unsubscribe token and reports the channel + current state WITHOUT
 * mutating anything. Backs the safe `GET` the confirmation page renders from, so
 * link scanners and prefetchers can hit it freely.
 * @returns The preview; `valid: false` (everything else nulled) for a bad token.
 */
export async function previewUnsubscribe(
  repos: Repos,
  secret: string,
  token: string,
): Promise<UnsubscribePreview> {
  const decoded = verifyUnsubscribeToken(secret, token);
  if (decoded === null) {
    return { valid: false, channel: null, channelLabel: null, alreadyUnsubscribed: false };
  }
  const context = await repos.userPreferences.getEmailNotificationContext(decoded.userId);
  return {
    valid: true,
    channel: decoded.channel,
    channelLabel: EMAIL_NOTIFICATION_CHANNEL_LABELS[decoded.channel],
    alreadyUnsubscribed: isChannelOff(decoded.channel, context?.emailNotifications),
  };
}

/**
 * Verifies the token and flips its channel off, preserving the sibling channel.
 * Idempotent: applying twice is a harmless no-op. This is the single mutation
 * shared by the RFC 8058 one-click POST and the web confirmation POST.
 * @returns The affected channel + label, or `null` if the token is invalid.
 */
export async function applyUnsubscribe(
  repos: Repos,
  secret: string,
  token: string,
): Promise<UnsubscribeResult | null> {
  const decoded = verifyUnsubscribeToken(secret, token);
  if (decoded === null) {
    return null;
  }
  const context = await repos.userPreferences.getEmailNotificationContext(decoded.userId);
  const next: EmailNotificationPreference = {
    ...context?.emailNotifications,
    [decoded.channel]: false,
  };
  await repos.userPreferences.upsert(decoded.userId, { emailNotifications: next });
  return {
    channel: decoded.channel,
    channelLabel: EMAIL_NOTIFICATION_CHANNEL_LABELS[decoded.channel],
  };
}
