import type { Logger } from "@openrift/shared/logger";
import { isTradeRequestEmailEnabled } from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import type { createEmailSender } from "../email.js";
import { buildTradeRequestEmail } from "../emails/trade-emails.js";
import { signUnsubscribeToken } from "../emails/unsubscribe-token.js";
import type { CardTrade } from "../repositories/card-trades.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/**
 * Kill switch (ADR-030). A `disable-*` flag so it's a true opt-out: absent or
 * `enabled=false` → send; toggle `enabled=true` to stop sending if a bug shows
 * up. Keep in sync with the KNOWN_FLAGS entry in the admin feature-flags page.
 */
export const TRADE_REQUEST_EMAIL_DISABLED_FLAG = "disable-trade-request-email";

/** Dependencies the trade-request email needs beyond `repos` (ADR-030). */
export interface TradeEmailDeps {
  sendEmail: SendEmail;
  /** Web origin for deep links + the unsubscribe route (BETTER_AUTH_URL). */
  appBaseUrl: string;
  /** App secret used to sign the stateless unsubscribe token. */
  unsubscribeSecret: string;
  log: Logger;
}

/**
 * Emails the non-initiator that a trade was requested (ADR-030). Gated by the
 * recipient's `tradeRequests` preference (on by default) and a verified email.
 *
 * Best-effort and side-effect-only: it never throws. The caller invokes it
 * after the trade row has committed and outside any transaction, so a mail
 * failure can never roll back or 500 the trade.
 */
export async function sendTradeRequestEmail(
  repos: Repos,
  trade: CardTrade,
  deps: TradeEmailDeps,
): Promise<void> {
  try {
    // Kill switch: stop all trade-request emails if the flag is toggled on.
    if ((await repos.featureFlags.isEnabled(TRADE_REQUEST_EMAIL_DISABLED_FLAG)) === true) {
      return;
    }

    // The recipient is the *non-initiator*: the party who didn't start the trade.
    const recipientUserId = trade.initiator === "giver" ? trade.receiverUserId : trade.giverUserId;

    const context = await repos.userPreferences.getEmailNotificationContext(recipientUserId);
    if (context === undefined || !context.emailVerified) {
      return;
    }
    if (!isTradeRequestEmailEnabled(context.emailNotifications)) {
      return;
    }

    // The recipient-oriented DTO carries the initiator as `counterparty` (name +
    // nickname) and the group slug for the deep link — no extra user query.
    const dto = await repos.cardTrades.getDtoByIdForUser(trade.id, recipientUserId);
    if (dto === undefined) {
      return;
    }
    const initiatorName = dto.counterparty.nickname ?? dto.counterparty.name;

    const cards = await repos.catalog.cardsByIds([trade.cardId]);
    const cardName = cards[0]?.name ?? "a card";

    const tradesUrl = `${deps.appBaseUrl}/groups/${dto.groupSlug}/trades`;
    const token = signUnsubscribeToken(deps.unsubscribeSecret, recipientUserId, "tradeRequests");
    const unsubscribeUrl = `${deps.appBaseUrl}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;

    const { subject, html } = buildTradeRequestEmail({
      recipientName: context.name,
      initiatorName,
      cardName,
      quantity: trade.quantity,
      // receiver-initiated = the initiator wants the card; giver-initiated = offer.
      kind: trade.initiator === "receiver" ? "wants" : "offers",
      tradesUrl,
      unsubscribeUrl,
    });

    await deps.sendEmail({ to: context.email, subject, html });
  } catch (error) {
    deps.log.error({ err: error, tradeId: trade.id }, "Failed to send trade-request email");
  }
}
