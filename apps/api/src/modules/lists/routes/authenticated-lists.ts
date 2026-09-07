import { listsContract } from "@openrift/shared/contracts/lists";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { ListGroupSharesResponse } from "@openrift/shared/types/api/friend-group";
import type {
  ListBulkAddResponse,
  ListDetailResponse,
  ListEntryResponse,
  ListKind,
  ListListResponse,
  ListMoveResponse,
  ListResponse,
  ListShareResponse,
} from "@openrift/shared/types/api/list";
import { ruleCombineMatchesKind, ruleKindForListKind } from "@openrift/shared/types/list-rule";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { assertDeleted, assertFound } from "../../../lib/assertions.js";
import { withUniqueShareToken } from "../../../lib/share-token.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { toList, toListDetail, toListEntry, toListEntryDetail } from "../lib/list-presenters.js";
import type { ListEntryUpdate, ListUpdate, NewEntryValues } from "../repositories/lists.js";

const os = implement(listsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The authenticated unified-lists contract, mounted at `/api/v1/lists`.
 * Bad-request / not-found / conflict states are thrown as `AppError` and
 * mapped by the handler's appErrorInterceptor.
 */
export const listsRouter = {
  list: os.list.handler(async ({ input, context }): Promise<ListListResponse> => {
    const { lists } = context.repos;
    const rows = await lists.listForUser(context.userId, input.intent);
    return { items: rows.map((row) => toList(row)) };
  }),

  create: os.create.handler(async ({ input, context }): Promise<ListResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;
    // A DB CHECK rejects non-null trade prefs on organize lists.
    const supportsPrefs = input.intent !== "organize";
    const tradeDefaults = supportsPrefs ? input.tradeDefaults : undefined;
    const row = await lists.create({
      userId,
      name: input.name,
      intent: input.intent,
      kind: input.kind,
      defaultPricePref: tradeDefaults?.pricePref ?? null,
      defaultPriceAbsoluteCents: tradeDefaults?.priceAbsoluteCents ?? null,
      defaultTradeType: tradeDefaults?.tradeType ?? null,
      currency: supportsPrefs ? (input.currency ?? null) : null,
      rules: input.rules ?? [],
      ruleCombine: input.ruleCombine ?? null,
    });
    return toList(row);
  }),

  get: os.get.handler(async ({ input, context }): Promise<ListDetailResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const list = await lists.getByIdForUser(input.id, userId);
    assertFound(list, "Not found");

    const entries = await lists.entriesWithDetails(input.id, list.kind, userId);

    return {
      list: toListDetail(list),
      entries: entries.map((row) => toListEntryDetail(row)),
    };
  }),

  update: os.update.handler(async ({ input, context }): Promise<ListResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    // A DB CHECK rejects non-null trade prefs on organize lists.
    const existing = await lists.getByIdForUser(input.id, userId);
    assertFound(existing, "Not found");
    const supportsPrefs = existing.intent !== "organize";

    // Built manually: the generic patch helper's "no fields" guard would
    // reject a tradeDefaults/currency-only patch.
    const updates: ListUpdate = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.sidebarHidden !== undefined) {
      updates.sidebarHidden = input.sidebarHidden;
    }
    if (supportsPrefs && input.tradeDefaults !== undefined) {
      updates.defaultPricePref = input.tradeDefaults.pricePref;
      updates.defaultPriceAbsoluteCents = input.tradeDefaults.priceAbsoluteCents;
      updates.defaultTradeType = input.tradeDefaults.tradeType;
    }
    if (supportsPrefs && input.currency !== undefined) {
      updates.currency = input.currency;
    }
    // Unlike create, the update payload carries no list kind, so this schema check runs here instead.
    if (input.rules !== undefined) {
      if (input.rules.some((rule) => rule.kind !== ruleKindForListKind(existing.kind))) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "rule kind must match the list kind");
      }
      updates.rules = input.rules;
    }
    // null resets the combine mode to the list kind's default.
    if (input.ruleCombine !== undefined) {
      if (input.ruleCombine !== null && !ruleCombineMatchesKind(input.ruleCombine, existing.kind)) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          "rule combine mode must match the list kind",
        );
      }
      updates.ruleCombine = input.ruleCombine;
    }
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No fields to update");
    }
    const row = await lists.update(input.id, userId, updates);
    assertFound(row, "Not found");
    return toList(row);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { lists } = context.repos;
    const result = await lists.deleteByIdForUser(input.id, context.userId);
    assertDeleted(result, "Not found");
  }),

  createEntry: os.createEntry.handler(async ({ input, context }): Promise<ListEntryResponse> => {
    const { lists, copies } = context.repos;
    const userId = context.userId;
    const listId = input.id;

    const list = await lists.getIdKindIntent(listId, userId);
    assertFound(list, "List not found");

    // Trade/wish lists may reference only copies the user personally owns; organize lists may reference shared group copies too.
    const personalOnly = list.intent !== "organize";
    const target = await resolveEntryTarget(list.kind, input, userId, copies, personalOnly);

    let row;
    try {
      row = await lists.createEntry({
        listId,
        userId,
        kind: list.kind,
        cardId: target.cardId,
        printingId: target.printingId,
        copyId: target.copyId,
        quantity: input.quantity,
        pricePref: input.tradeOverride.pricePref,
        priceAbsoluteCents: input.tradeOverride.priceAbsoluteCents,
        tradeType: input.tradeOverride.tradeType,
      });
    } catch (error) {
      // 23505 (unique_violation): the partial unique index rejects a duplicate target.
      if (error instanceof Error && "code" in error && error.code === "23505") {
        throw new AppError(409, ERROR_CODES.CONFLICT, "That item is already in the list");
      }
      throw error;
    }

    return toListEntry(row);
  }),

  bulkCreateEntries: os.bulkCreateEntries.handler(
    async ({ input, context }): Promise<ListBulkAddResponse> => {
      const { lists, copies } = context.repos;
      const userId = context.userId;
      const listId = input.id;
      const { entries } = input;

      const list = await lists.getIdKindIntent(listId, userId);
      assertFound(list, "List not found");

      for (const entry of entries) {
        if (!targetMatchesKind(list.kind, entry)) {
          throw new AppError(
            400,
            ERROR_CODES.BAD_REQUEST,
            `Every entry must target the list's kind (${list.kind})`,
          );
        }
      }

      // Copy-kind entries not accessible to the user are dropped, not rejected.
      // Trade lists see only the user's own collections; organize lists also see shared group collections.
      const personalOnly = list.intent !== "organize";
      let usableEntries = entries;
      if (list.kind === "copy") {
        const copyIdsRequested = entries
          .map((entry) => entry.copyId)
          .filter((id): id is string => id !== undefined);
        const accessibleCopyIds = new Set(
          copyIdsRequested.length > 0
            ? await copies.filterAccessibleByViewer(copyIdsRequested, userId, personalOnly)
            : [],
        );
        usableEntries = entries.filter(
          (entry) => entry.copyId !== undefined && accessibleCopyIds.has(entry.copyId),
        );
      }

      const usable: NewEntryValues[] = usableEntries.map((entry) => ({
        listId,
        userId,
        kind: list.kind,
        cardId: entry.cardId ?? null,
        printingId: entry.printingId ?? null,
        copyId: entry.copyId ?? null,
        quantity: entry.quantity,
        pricePref: entry.tradeOverride.pricePref,
        priceAbsoluteCents: entry.tradeOverride.priceAbsoluteCents,
        tradeType: entry.tradeOverride.tradeType,
      }));

      const result = await lists.bulkCreateEntries(list.kind, usable);

      // Card/printing-kind dupes merge via quantity bump and count as `updated`, not `skipped`.
      return {
        added: result.inserted,
        updated: result.updated,
        skipped: entries.length - result.inserted - result.updated,
      };
    },
  ),

  // Non-owned copies and existing duplicates are skipped silently and reflected in `skipped`.
  bulkAddFromCopies: os.bulkAddFromCopies.handler(
    async ({ input, context }): Promise<ListBulkAddResponse> => {
      const { lists } = context.repos;
      const userId = context.userId;
      const listId = input.id;

      const list = await lists.getIdKindIntent(listId, userId);
      assertFound(list, "List not found");

      // Trade/wish lists derive entries only from the user's own copies;
      // organize lists may derive from shared group copies too.
      const personalOnly = list.intent !== "organize";
      return lists.bulkCreateEntriesFromCopies(
        listId,
        list.kind,
        userId,
        input.copyIds,
        personalOnly,
      );
    },
  ),

  // The destination list must match the source on kind and intent.
  moveEntries: os.moveEntries.handler(async ({ input, context }): Promise<ListMoveResponse> => {
    const { moveListEntries } = context.services;
    const repos = context.repos;
    const transact = context.transact;
    const userId = context.userId;

    return await moveListEntries(repos, transact, userId, input.id, input.toListId, input.entryIds);
  }),

  updateEntry: os.updateEntry.handler(async ({ input, context }): Promise<ListEntryResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;
    // Built manually: the generic patch helper would reject a tradeOverride-only patch as empty.
    const updates: ListEntryUpdate = {};
    if (input.quantity !== undefined) {
      updates.quantity = input.quantity;
    }
    if (input.tradeOverride !== undefined) {
      updates.pricePref = input.tradeOverride.pricePref;
      updates.priceAbsoluteCents = input.tradeOverride.priceAbsoluteCents;
      updates.tradeType = input.tradeOverride.tradeType;
    }
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No fields to update");
    }
    const row = await lists.updateEntry(input.itemId, input.id, userId, updates);
    assertFound(row, "Not found");
    return toListEntry(row);
  }),

  removeEntry: os.removeEntry.handler(async ({ input, context }): Promise<void> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const result = await lists.deleteEntry(input.itemId, input.id, userId);
    assertDeleted(result, "Not found");
  }),

  // An owned-but-unshared list resolves to { shareToken: null, isPublic: false }; 404 means not owned.
  getShare: os.getShare.handler(async ({ input, context }): Promise<ListShareResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const state = await lists.getShareState(input.id, userId);
    assertFound(state, "Not found");

    return state;
  }),

  // deleteEntriesByIds silently drops ids not owned by this list/user; a missing list still 404s.
  bulkDeleteEntries: os.bulkDeleteEntries.handler(async ({ input, context }): Promise<void> => {
    const { lists } = context.repos;
    const userId = context.userId;
    const listId = input.id;

    const list = await lists.getIdKindIntent(listId, userId);
    assertFound(list, "List not found");

    await lists.deleteEntriesByIds(input.entryIds, listId, userId);
  }),

  share: os.share.handler(async ({ input, context }): Promise<ListShareResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const current = await lists.getShareState(input.id, userId);
    assertFound(current, "Not found");
    if (current.shareToken !== null) {
      return current;
    }

    const token = await withUniqueShareToken(async (candidate) => {
      const updated = await lists.setShareToken(input.id, userId, candidate, true);
      assertFound(updated, "Not found");
      return candidate;
    });

    return { shareToken: token, isPublic: true };
  }),

  // Rotating an unshared list shares it.
  rotateShare: os.rotateShare.handler(async ({ input, context }): Promise<ListShareResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const token = await withUniqueShareToken(async (candidate) => {
      const updated = await lists.setShareToken(input.id, userId, candidate, true);
      assertFound(updated, "Not found");
      return candidate;
    });

    return { shareToken: token, isPublic: true };
  }),

  unshare: os.unshare.handler(async ({ input, context }): Promise<void> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const updated = await lists.setShareToken(input.id, userId, null, false);
    assertFound(updated, "Not found");
  }),

  // Lists outside the given intent bucket are silently ignored.
  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { lists } = context.repos;
    const userId = context.userId;
    await lists.reorder(userId, input.intent, input.orderedIds);
  }),

  groupShares: os.groupShares.handler(
    async ({ input, context }): Promise<ListGroupSharesResponse> => {
      const { lists, friendGroups } = context.repos;
      const userId = context.userId;

      const list = await lists.getByIdForUser(input.id, userId);
      assertFound(list, "List not found");

      const items = await friendGroups.listGroupsSharingList(input.id);
      return { items };
    },
  ),
};

/**
 * Validates that the body's target matches the list's kind, and pre-checks
 * copy ownership for kind = 'copy' so the route returns a clean 404 instead
 * of leaking the composite-FK error from the DB.
 */
async function resolveEntryTarget(
  kind: ListKind,
  body: { cardId?: string; printingId?: string; copyId?: string },
  userId: string,
  copies: {
    existsForViewer: (id: string, userId: string, personalOnly?: boolean) => Promise<unknown>;
  },
  personalOnly: boolean,
): Promise<{ cardId: string | null; printingId: string | null; copyId: string | null }> {
  if (!targetMatchesKind(kind, body)) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Entry target must match the list's kind (${kind})`,
    );
  }
  if (kind === "card") {
    return { cardId: body.cardId ?? null, printingId: null, copyId: null };
  }
  if (kind === "printing") {
    return { cardId: null, printingId: body.printingId ?? null, copyId: null };
  }
  const copyId = body.copyId;
  if (copyId !== undefined) {
    const accessible = await copies.existsForViewer(copyId, userId, personalOnly);
    assertFound(accessible, "Copy not found");
  }
  return { cardId: null, printingId: null, copyId: copyId ?? null };
}

function targetMatchesKind(
  kind: ListKind,
  body: { cardId?: string; printingId?: string; copyId?: string },
): boolean {
  if (kind === "card") {
    return body.cardId !== undefined && body.printingId === undefined && body.copyId === undefined;
  }
  if (kind === "printing") {
    return body.printingId !== undefined && body.cardId === undefined && body.copyId === undefined;
  }
  return body.copyId !== undefined && body.cardId === undefined && body.printingId === undefined;
}
