import type {
  EmailNotificationChannel,
  EmailNotificationPreference,
  TradeRequestEmailCadence,
} from "@openrift/shared/types/api/preferences";
import {
  getTradeRequestEmailCadence,
  isCardSubmissionEmailEnabled,
  isGroupApprovalEmailEnabled,
  isGroupJoinRequestEmailEnabled,
  isTradeMatchDigestEnabled,
  isTradeRequestEmailEnabled,
  isTradeStatusEmailEnabled,
} from "@openrift/shared/types/api/preferences";

export interface EmailNotificationGates {
  tradeMatches: boolean;
  tradeRequests: boolean;
  tradeStatus: boolean;
  tradeRequestCadence: TradeRequestEmailCadence;
  cardSubmissions: boolean;
  groupJoinRequests: boolean;
  groupApprovals: boolean;
}

export function resolveEmailNotificationGates(
  prefs: EmailNotificationPreference | undefined,
): EmailNotificationGates {
  return {
    tradeMatches: isTradeMatchDigestEnabled(prefs),
    tradeRequests: isTradeRequestEmailEnabled(prefs),
    tradeStatus: isTradeStatusEmailEnabled(prefs),
    tradeRequestCadence: getTradeRequestEmailCadence(prefs),
    cardSubmissions: isCardSubmissionEmailEnabled(prefs),
    groupJoinRequests: isGroupJoinRequestEmailEnabled(prefs),
    groupApprovals: isGroupApprovalEmailEnabled(prefs),
  };
}

/** The server merge replaces the whole object, so unchanged keys must be carried over. */
export function buildEmailNotificationPatch(
  current: EmailNotificationPreference | undefined,
  channel: EmailNotificationChannel,
  value: boolean,
): EmailNotificationPreference {
  return { ...current, [channel]: value };
}

export function buildTradeRequestCadencePatch(
  current: EmailNotificationPreference | undefined,
  cadence: TradeRequestEmailCadence,
): EmailNotificationPreference {
  return { ...current, tradeRequestCadence: cadence };
}
