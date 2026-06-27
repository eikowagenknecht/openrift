import { ERROR_CODES } from "@openrift/shared";
import type {
  ListBulkAddResponse,
  ListBulkAddWriteResponse,
  ListDetailResponse,
  ListEntryWriteResponse,
  ListGroupSharesResponse,
  ListKind,
  ListListResponse,
  ListMoveResponse,
  ListMutationResponse,
  ListShareResponse,
  ListWriteResponse,
} from "@openrift/shared";
import { listsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { ListEntryUpdate, ListUpdate, NewEntryValues } from "../../repositories/lists.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { toList, toListEntry, toListEntryDetail } from "../../utils/mappers.js";
import { generateShareToken } from "../../utils/share-token.js";

const os = implement(listsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The authenticated unified-lists contract (ADR-017), mounted at
 * `/api/v1/lists`. Bad-request / not-found / conflict states are thrown as
 * `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const listsRouter = {
  // ── LIST ────────────────────────────────────────────────────────────────────
  list: os.list.handler(async ({ input, context }): Promise<ListListResponse> => {
    const { lists } = context.repos;
    const rows = await lists.listForUser(context.userId, input.intent);
    return { items: rows.map((row) => toList(row)) };
  }),

  // ── CREATE ──────────────────────────────────────────────────────────────────
  create: os.create.handler(async ({ input, context, errors }): Promise<ListWriteResponse> => {
    const { transact } = context;
    const userId = context.userId;
    // ADR-017: trade defaults only apply to wish/trade lists. The DB CHECK
    // constraint rejects non-null prefs on organize lists; we strip here so
    // the API never round-trips a 500.
    const supportsPrefs = input.intent !== "organize";
    const tradeDefaults = supportsPrefs ? input.tradeDefaults : undefined;
    // One transaction so the insert carries the txid the client awaits on the
    // Electric stream (ADR-027 step 2). Group visibility is opt-in (ADR-013): a
    // new list is private and the owner shares it with specific groups from the
    // create dialog or the manage page.
    let created;
    try {
      created = await transact(async (trxRepos) => {
        const row = await trxRepos.lists.create({
          id: input.id,
          userId,
          name: input.name,
          intent: input.intent,
          kind: input.kind,
          defaultPricePref: tradeDefaults?.pricePref ?? null,
          defaultPriceAbsoluteCents: tradeDefaults?.priceAbsoluteCents ?? null,
          defaultTradeType: tradeDefaults?.tradeType ?? null,
          currency: supportsPrefs ? (input.currency ?? null) : null,
        });
        return { row, txid: await trxRepos.sync.currentTransactionId() };
      });
    } catch (error) {
      // 23505 = unique_violation: a client-supplied list id already exists
      // (e.g. a retried request whose first attempt did land). Report a clean
      // conflict the client can treat as "already applied".
      if (error instanceof Error && "code" in error && error.code === "23505") {
        throw errors.CONFLICT({ message: "List already exists" });
      }
      throw error;
    }
    return { ...toList(created.row), txid: created.txid };
  }),

  // ── GET ONE (with enriched entries) ─────────────────────────────────────────
  get: os.get.handler(async ({ input, context }): Promise<ListDetailResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const list = await lists.getByIdForUser(input.id, userId);
    assertFound(list, "Not found");

    const entries = await lists.entriesWithDetails(input.id, list.kind, userId);

    return {
      list: toList(list),
      entries: entries.map((row) => toListEntryDetail(row)),
    };
  }),

  // ── UPDATE (name + trade prefs; intent/kind immutable post-creation) ───────
  update: os.update.handler(async ({ input, context }): Promise<ListWriteResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    // ADR-017: trade defaults/currency only apply to wish/trade lists — the DB
    // CHECK rejects non-null prefs on organize lists. Look up the list's intent
    // and strip those fields for organize lists (mirroring create), so a PATCH
    // that carries them is a no-op for those fields instead of a 500.
    const existing = await lists.getByIdForUser(input.id, userId);
    assertFound(existing, "Not found");
    const supportsPrefs = existing.intent !== "organize";

    // Build updates manually so a tradeDefaults- or currency-only patch
    // doesn't trip the generic patch helper's "no fields" guard. (Same
    // pattern as the entry PATCH handler.)
    const updates: ListUpdate = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (supportsPrefs && input.tradeDefaults !== undefined) {
      updates.defaultPricePref = input.tradeDefaults.pricePref;
      updates.defaultPriceAbsoluteCents = input.tradeDefaults.priceAbsoluteCents;
      updates.defaultTradeType = input.tradeDefaults.tradeType;
    }
    if (supportsPrefs && input.currency !== undefined) {
      updates.currency = input.currency;
    }
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No fields to update");
    }
    // Transaction-bound so the txid the client awaits on the Electric stream
    // is the update's own transaction (ADR-027 step 2).
    const { row, txid } = await context.transact(async (trxRepos) => ({
      row: await trxRepos.lists.update(input.id, userId, updates),
      txid: await trxRepos.sync.currentTransactionId(),
    }));
    assertFound(row, "Not found");
    return { ...toList(row), txid };
  }),

  // ── DELETE ──────────────────────────────────────────────────────────────────
  remove: os.remove.handler(async ({ input, context }): Promise<ListMutationResponse> => {
    const userId = context.userId;
    // Transaction-bound so the txid the client awaits on the Electric stream
    // is the deletion's own transaction (ADR-027 step 2).
    const { result, txid } = await context.transact(async (trxRepos) => ({
      result: await trxRepos.lists.deleteByIdForUser(input.id, userId),
      txid: await trxRepos.sync.currentTransactionId(),
    }));
    assertDeleted(result, "Not found");
    return { txid };
  }),

  // ── POST /lists/:id/entries ───────────────────────────────────────────────
  // Single-add path: the entry id is server-generated (the synced client adds
  // through `bulkCreateEntries`), so the contract input drops the optional
  // client-supplied entry id, which would otherwise collide with the `{id}`
  // list path param.
  createEntry: os.createEntry.handler(
    async ({ input, context, errors }): Promise<ListEntryWriteResponse> => {
      const { lists, copies } = context.repos;
      const userId = context.userId;
      const listId = input.id;

      const list = await lists.getIdKindIntent(listId, userId);
      assertFound(list, "List not found");

      // Trade/wish lists may only reference copies the user personally owns — a
      // card you merely have group access to isn't yours to trade away or wish
      // for. Organize lists may reference shared group copies too.
      const personalOnly = list.intent !== "organize";
      const target = await resolveEntryTarget(list.kind, input, userId, copies, personalOnly);

      // Transaction-bound so the txid the client awaits on the Electric stream
      // is the insert's own transaction (ADR-027 step 2).
      let created;
      try {
        created = await context.transact(async (trxRepos) => ({
          row: await trxRepos.lists.createEntry({
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
          }),
          txid: await trxRepos.sync.currentTransactionId(),
        }));
      } catch (error) {
        // 23505 = unique_violation: this exact target is already in the list.
        // The bulk endpoint merges duplicates; the single-add path reports a
        // clean 409 instead of letting the partial unique index throw a 500.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw errors.CONFLICT({ message: "That item is already in the list" });
        }
        throw error;
      }

      return { ...toListEntry(created.row), txid: created.txid };
    },
  ),

  // ── POST /lists/:id/entries/bulk ──────────────────────────────────────────
  bulkCreateEntries: os.bulkCreateEntries.handler(
    async ({ input, context }): Promise<ListBulkAddWriteResponse> => {
      const { lists, copies } = context.repos;
      const userId = context.userId;
      const listId = input.id;
      const { entries } = input;

      const list = await lists.getIdKindIntent(listId, userId);
      assertFound(list, "List not found");

      // Reject the whole batch if any entry's target column doesn't match the
      // list's kind — the partial-index ON CONFLICT (and the FK) would fail on
      // a mismatch anyway. A clean 400 here avoids a confusing DB-level error.
      for (const entry of entries) {
        if (!targetMatchesKind(list.kind, entry)) {
          throw new AppError(
            400,
            ERROR_CODES.BAD_REQUEST,
            `Every entry must target the list's kind (${list.kind})`,
          );
        }
      }

      // Copy-kind lists: filter to copies the user may reference; drop the rest
      // silently rather than 400-ing the whole batch. Trade lists are restricted
      // to the user's own collections (a copy you merely have group access to
      // isn't yours to trade away); organize-copy lists may reference shared
      // group collections too. Card/printing kinds pass through (FK enforces
      // target row existence).
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
        id: entry.id,
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

      // Transaction-bound so the txid the client awaits on the Electric stream
      // is the upsert's own transaction (ADR-027 step 2).
      const { result, txid } = await context.transact(async (trxRepos) => ({
        result: await trxRepos.lists.bulkCreateEntries(list.kind, usable),
        txid: await trxRepos.sync.currentTransactionId(),
      }));

      // `skipped` captures the ownership filter (copy-kind only), any copy-kind
      // dupes that took the DO NOTHING branch, and replayed inserts the id
      // guard in bulkCreateEntries turned into no-ops. Card/printing-kind dupes
      // merge into existing rows via quantity bump and surface as `updated`,
      // not `skipped`.
      return {
        added: result.inserted,
        updated: result.updated,
        skipped: entries.length - result.inserted - result.updated,
        txid,
      };
    },
  ),

  // ── POST /lists/:id/entries/from-copies ──────────────────────────────────
  // Drag-from-collections sugar. Front-end passes copy IDs from a drag; the
  // repo derives the right target shape based on the list's kind:
  //   kind = copy     → one entry per owned copy
  //   kind = printing → one entry per distinct printing across the copies
  //   kind = card     → one entry per distinct card across the copies
  // Non-owned copies and existing duplicates are skipped silently and
  // reflected in `skipped`.
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

  // ── POST /lists/:id/entries/move ─────────────────────────────────────────
  // Move entries from this list (the {id} in the path) to another list owned
  // by the same user. The destination must match the source on kind + intent
  // — different kind would reshape every entry, different intent would
  // silently re-purpose them (turning a wishlist into a tradelist row).
  moveEntries: os.moveEntries.handler(async ({ input, context }): Promise<ListMoveResponse> => {
    const { moveListEntries } = context.services;
    const repos = context.repos;
    const transact = context.transact;
    const userId = context.userId;

    return await moveListEntries(repos, transact, userId, input.id, input.toListId, input.entryIds);
  }),

  // ── PATCH /lists/:id/entries/:itemId ──────────────────────────────────────
  updateEntry: os.updateEntry.handler(
    async ({ input, context }): Promise<ListEntryWriteResponse> => {
      const userId = context.userId;
      // Build the updates manually so we can mix two field categories
      // (scalar `quantity` and the nested `tradeOverride` triple) without the
      // generic patch helper rejecting a tradeOverride-only patch as empty.
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
      // Transaction-bound so the txid the client awaits on the Electric stream
      // is the update's own transaction (ADR-027 step 2).
      const { row, txid } = await context.transact(async (trxRepos) => ({
        row: await trxRepos.lists.updateEntry(input.itemId, input.id, userId, updates),
        txid: await trxRepos.sync.currentTransactionId(),
      }));
      assertFound(row, "Not found");
      return { ...toListEntry(row), txid };
    },
  ),

  // ── DELETE /lists/:id/entries/:itemId ─────────────────────────────────────
  removeEntry: os.removeEntry.handler(async ({ input, context }): Promise<ListMutationResponse> => {
    const userId = context.userId;
    // Transaction-bound so the txid the client awaits on the Electric stream
    // is the deletion's own transaction (ADR-027 step 2).
    const { result, txid } = await context.transact(async (trxRepos) => ({
      result: await trxRepos.lists.deleteEntry(input.itemId, input.id, userId),
      txid: await trxRepos.sync.currentTransactionId(),
    }));
    assertDeleted(result, "Not found");
    return { txid };
  }),

  // ── GET /lists/:id/share ──────────────────────────────────────────────────
  // Owner-only. Reports the current share state. An owned-but-unshared list
  // resolves to { shareToken: null, isPublic: false } rather than 404 — 404 is
  // reserved for lists the caller doesn't own.
  getShare: os.getShare.handler(async ({ input, context }): Promise<ListShareResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const state = await lists.getShareState(input.id, userId);
    assertFound(state, "Not found");

    return state;
  }),

  // ── POST /lists/:id/entries/bulk-delete ───────────────────────────────────
  // Bulk-remove from select mode. deleteEntriesByIds is scoped to the list +
  // owner, so entry ids from another list (or another user) are filtered out
  // rather than erroring. We still 404 a missing list so a stale URL is loud.
  bulkDeleteEntries: os.bulkDeleteEntries.handler(
    async ({ input, context }): Promise<ListMutationResponse> => {
      const { lists } = context.repos;
      const userId = context.userId;
      const listId = input.id;

      const list = await lists.getIdKindIntent(listId, userId);
      assertFound(list, "List not found");

      // Transaction-bound so the txid the client awaits on the Electric stream
      // is the deletion's own transaction (ADR-027 step 2).
      const { txid } = await context.transact(async (trxRepos) => {
        await trxRepos.lists.deleteEntriesByIds(input.entryIds, listId, userId);
        return { txid: await trxRepos.sync.currentTransactionId() };
      });

      return { txid };
    },
  ),

  // ── POST /lists/:id/share ─────────────────────────────────────────────────
  // Idempotent enable: if the list already has a token, return the existing
  // share state unchanged (no token churn). Otherwise mint a token and flip
  // is_public=true. Token rotation lives in the dedicated /share/rotate route.
  share: os.share.handler(async ({ input, context }): Promise<ListShareResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const current = await lists.getShareState(input.id, userId);
    assertFound(current, "Not found");
    if (current.shareToken !== null) {
      return current;
    }

    const token = generateShareToken();
    const updated = await lists.setShareToken(input.id, userId, token, true);
    assertFound(updated, "Not found");

    return { shareToken: token, isPublic: true };
  }),

  // ── POST /lists/:id/share/rotate ──────────────────────────────────────────
  // Owner-only. Mints a NEW token (the previous URL stops resolving) and
  // ensures is_public=true. Treats rotate-while-unshared as "share now" rather
  // than 409 — setShareToken supports it cleanly, so a client that rotates
  // before sharing just ends up shared, matching the bundle-share precedent.
  rotateShare: os.rotateShare.handler(async ({ input, context }): Promise<ListShareResponse> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const token = generateShareToken();
    const updated = await lists.setShareToken(input.id, userId, token, true);
    assertFound(updated, "Not found");

    return { shareToken: token, isPublic: true };
  }),

  // ── DELETE /lists/:id/share ───────────────────────────────────────────────
  // Nulls the share token and sets is_public=false. Old links 404 forever.
  unshare: os.unshare.handler(async ({ input, context }): Promise<void> => {
    const { lists } = context.repos;
    const userId = context.userId;

    const updated = await lists.setShareToken(input.id, userId, null, false);
    assertFound(updated, "Not found");
  }),

  // ── POST /lists/reorder ───────────────────────────────────────────────────
  // Bulk reorder for the user's lists in a single intent bucket. Lists in
  // other intents are silently ignored so the client only needs to send the
  // current bucket's view.
  reorder: os.reorder.handler(async ({ input, context }): Promise<ListMutationResponse> => {
    const userId = context.userId;
    // Transaction-bound so the txid the client awaits on the Electric stream
    // is the reorder's own transaction (ADR-027 step 2).
    const { txid } = await context.transact(async (trxRepos) => {
      await trxRepos.lists.reorder(userId, input.intent, input.orderedIds);
      return { txid: await trxRepos.sync.currentTransactionId() };
    });
    return { txid };
  }),

  // ── GET /lists/:id/group-shares (ADR-013) ─────────────────────────────────
  // The "shared with N groups" badge on the list page. Scoped to lists the
  // viewer owns; non-owned lists 404.
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
 * @returns The normalized triple with two nulls and one ID matching `kind`.
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
  // kind === "copy"
  const copyId = body.copyId;
  if (copyId !== undefined) {
    const accessible = await copies.existsForViewer(copyId, userId, personalOnly);
    assertFound(accessible, "Copy not found");
  }
  return { cardId: null, printingId: null, copyId: copyId ?? null };
}

/**
 * @returns Whether the body's single non-null target is the one expected by `kind`.
 */
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
