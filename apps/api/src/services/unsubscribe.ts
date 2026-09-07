import type { EmailNotificationChannel, EmailNotificationPreference } from "@openrift/shared/types";
import {
  EMAIL_NOTIFICATION_CHANNEL_LABELS,
  isCardSubmissionEmailEnabled,
  isGroupApprovalEmailEnabled,
  isGroupJoinRequestEmailEnabled,
  isTradeMatchDigestEnabled,
  isTradeRequestEmailEnabled,
  isTradeStatusEmailEnabled,
} from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import { verifyUnsubscribeToken } from "../emails/unsubscribe-token.js";

export interface UnsubscribePreview {
  valid: boolean;
  channel: EmailNotificationChannel | null;
  channelLabel: string | null;
  alreadyUnsubscribed: boolean;
}

export interface UnsubscribeResult {
  channel: EmailNotificationChannel;
  channelLabel: string;
}

/** `tradeMatches` and `cardSubmissions` are opt-in; every other channel is opt-out. */
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
    case "groupApprovals": {
      return !isGroupApprovalEmailEnabled(prefs);
    }
    default: {
      return !isTradeRequestEmailEnabled(prefs);
    }
  }
}

/** Read-only: never mutates, so link scanners and prefetchers can hit the GET freely. */
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

/** Idempotent. Shared by both the RFC 8058 one-click POST and the web confirmation POST. */
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
