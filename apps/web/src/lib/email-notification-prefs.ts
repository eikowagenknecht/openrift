import type {
  EmailNotificationChannel,
  EmailNotificationPreference,
  TradeRequestEmailCadence,
} from "@openrift/shared";
import {
  getTradeRequestEmailCadence,
  isCardSubmissionEmailEnabled,
  isTradeMatchDigestEnabled,
  isTradeRequestEmailEnabled,
  isTradeStatusEmailEnabled,
} from "@openrift/shared";

/** Resolved state of the email-notification settings (ADR-030). */
export interface EmailNotificationGates {
  /** Daily match digest — opt-in, so off unless explicitly enabled. */
  tradeMatches: boolean;
  /** Trade-request email — opt-out, so on unless explicitly disabled. */
  tradeRequests: boolean;
  /** Trade status emails (accepted / declined / cancelled) — opt-out, default on. */
  tradeStatus: boolean;
  /** Delivery cadence shared by trade-request and trade-status emails. */
  tradeRequestCadence: TradeRequestEmailCadence;
  /** Admin card-submission alert (ADR-036) — opt-in, so off unless enabled. */
  cardSubmissions: boolean;
}

/**
 * Derives the switch positions and cadence from stored preferences, honouring
 * each setting's default (digest off, request on, default cadence) when its key
 * is absent.
 * @returns The resolved email-notification state.
 */
export function resolveEmailNotificationGates(
  prefs: EmailNotificationPreference | undefined,
): EmailNotificationGates {
  return {
    tradeMatches: isTradeMatchDigestEnabled(prefs),
    tradeRequests: isTradeRequestEmailEnabled(prefs),
    tradeStatus: isTradeStatusEmailEnabled(prefs),
    tradeRequestCadence: getTradeRequestEmailCadence(prefs),
    cardSubmissions: isCardSubmissionEmailEnabled(prefs),
  };
}

/**
 * Builds the next `emailNotifications` object for a single-channel toggle. The
 * server merge replaces the whole object, so the unchanged sibling keys are
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

/**
 * Builds the next `emailNotifications` object for a cadence change, preserving
 * the unchanged channel toggles (same whole-object merge as the toggles).
 * @returns The full object to send in the preferences PATCH.
 */
export function buildTradeRequestCadencePatch(
  current: EmailNotificationPreference | undefined,
  cadence: TradeRequestEmailCadence,
): EmailNotificationPreference {
  return { ...current, tradeRequestCadence: cadence };
}
