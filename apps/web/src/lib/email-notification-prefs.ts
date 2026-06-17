import type { EmailNotificationChannel, EmailNotificationPreference } from "@openrift/shared";
import { isTradeMatchDigestEnabled, isTradeRequestEmailEnabled } from "@openrift/shared";

/** Resolved on/off state of both email-notification channels (ADR-030). */
export interface EmailNotificationGates {
  /** Daily match digest — opt-in, so off unless explicitly enabled. */
  tradeMatches: boolean;
  /** Instant trade-request email — opt-out, so on unless explicitly disabled. */
  tradeRequests: boolean;
}

/**
 * Derives the switch positions from stored preferences, honouring each
 * channel's default (digest off, request on) when the key is absent.
 * @returns The resolved on/off state for both channels.
 */
export function resolveEmailNotificationGates(
  prefs: EmailNotificationPreference | undefined,
): EmailNotificationGates {
  return {
    tradeMatches: isTradeMatchDigestEnabled(prefs),
    tradeRequests: isTradeRequestEmailEnabled(prefs),
  };
}

/**
 * Builds the next `emailNotifications` object for a single-channel toggle. The
 * server merge replaces the whole object, so the unchanged sibling key is
 * carried over verbatim (absent stays absent, explicit stays explicit).
 * @returns The full object to send in the preferences PATCH.
 */
export function buildEmailNotificationPatch(
  current: EmailNotificationPreference | undefined,
  channel: EmailNotificationChannel,
  value: boolean,
): EmailNotificationPreference {
  return { ...current, [channel]: value };
}
