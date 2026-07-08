import { ERROR_CODES } from "@openrift/shared";
import { adminCardBansContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { recordAdminEvent } from "../../../services/record-admin-event.js";
import { assertFound } from "../../../utils/assertions.js";

const os = implement(adminCardBansContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin card-ban management. Not-found / conflict states are thrown as
 * `AppError` (via {@link assertFound} or directly) and mapped by the handler's
 * appErrorInterceptor. `createdAt` is mapped from `Date` to an ISO string for
 * the output schema. The DELETE handler 404s on a no-match, consistent with
 * PATCH — see the inline note in `remove`.
 */
export const adminCardBansRouter = {
  list: os.list.handler(async ({ input, context }) => {
    const { cardBans } = context.repos;
    const rows = await cardBans.listByCard(input.id);
    return {
      bans: rows.map((r) => ({
        id: r.id,
        cardId: r.cardId,
        formatId: r.formatId,
        formatName: r.formatName,
        bannedAt: r.bannedAt,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { cardBans, catalog } = context.repos;
    const { id, formatId, bannedAt, reason } = input;

    // Verify card exists
    const card = await catalog.cardById(id);
    assertFound(card, "Card not found");

    // Check for duplicate active ban
    const existing = await cardBans.findActiveBan(id, formatId);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Card is already banned in ${formatId}`);
    }

    const row = await cardBans.create({ cardId: id, formatId, bannedAt, reason: reason ?? null });

    // catalog.cardById only returns the id — fetch name/slug for the label
    const cardDetails = await context.repos.candidateMutations.getCardById(id);
    await recordAdminEvent(context.repos, context.userId, {
      action: "ban.add",
      entityType: "ban",
      entityId: row.id,
      entityLabel: cardDetails?.name ?? null,
      cardSlug: cardDetails?.slug ?? null,
      newValues: { cardId: id, formatId, bannedAt, reason: reason ?? null },
    });

    return {
      ban: {
        id: row.id,
        cardId: row.cardId,
        formatId: row.formatId,
        formatName: row.formatName,
        bannedAt: row.bannedAt,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      },
    };
  }),

  update: os.update.handler(async ({ input, context }) => {
    const { cardBans } = context.repos;
    const { id, formatId, bannedAt, reason } = input;

    const fields: { bannedAt?: string; reason?: string | null } = {};
    if (bannedAt !== undefined) {
      fields.bannedAt = bannedAt;
    }
    if (reason !== undefined) {
      fields.reason = reason;
    }

    const before = await cardBans.findActiveBan(id, formatId);

    const row = await cardBans.update(id, formatId, fields);
    assertFound(row, `No active ban found for format ${formatId}`);

    await recordAdminEvent(context.repos, context.userId, {
      action: "ban.update",
      entityType: "ban",
      entityId: row.id,
      oldValues: before ? { bannedAt: before.bannedAt, reason: before.reason } : null,
      newValues: fields,
    });

    return {
      ban: {
        id: row.id,
        cardId: row.cardId,
        formatId: row.formatId,
        formatName: row.formatName,
        bannedAt: row.bannedAt,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      },
    };
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { cardBans } = context.repos;
    const { id, formatId } = input;

    const before = await cardBans.findActiveBan(id, formatId);

    // `unban` returns a boolean (not a row), so use an explicit check rather
    // than `assertFound` (which only catches null/undefined) — this 404s when
    // no active ban matched, consistent with the PATCH handler above.
    const removed = await cardBans.unban(id, formatId);
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `No active ban found for format ${formatId}`);
    }

    await recordAdminEvent(context.repos, context.userId, {
      action: "ban.delete",
      entityType: "ban",
      entityId: before?.id ?? null,
      oldValues: { cardId: id, formatId, bannedAt: before?.bannedAt, reason: before?.reason },
    });
  }),
};
