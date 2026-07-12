import { ERROR_CODES } from "@openrift/shared";
import type {
  ClearCollectionResponse,
  CollectionGroupSharesResponse,
  CollectionListResponse,
  CollectionResponse,
  CollectionShareResponse,
  CopyListResponse,
  ResetCollectionsResponse,
} from "@openrift/shared";
import { collectionsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { CollectionsTable } from "../../db/index.js";
import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import { buildCopiesCursor, clampCopiesLimit } from "../../repositories/copies.js";
import { assertFound } from "../../utils/assertions.js";
import { toCollection, toCopy } from "../../utils/mappers.js";
import { getFavoriteMarketplace } from "../../utils/preferences.js";
import { generateShareToken } from "../../utils/share-token.js";

const patchFields: FieldMapping<Updateable<CollectionsTable>> = {
  name: "name",
  description: "description",
  sortOrder: "sortOrder",
};

const os = implement(collectionsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Authenticated collections contract (mounted at `/api/v1/collections`).
 * Not-found / forbidden / conflict states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const collectionsRouter = {
  // ── LIST ────────────────────────────────────────────────────────────────────
  list: os.list.handler(async ({ context }): Promise<CollectionListResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const rows = await repos.collections.listAccessibleForUser(userId);
    const values = await repos.marketplace.collectionValues(
      rows.map((row) => row.id),
      favMarketplace,
    );
    return { items: rows.map((row) => toCollection(row, values.get(row.id))) };
  }),

  // ── CREATE ──────────────────────────────────────────────────────────────────
  create: os.create.handler(async ({ input, context }): Promise<CollectionResponse> => {
    const { collections, collectionDeckbuildingPrefs, friendGroups } = context.repos;
    const userId = context.userId;

    let groupId: string | null = null;
    let groupSlug: string | null = null;
    let groupName: string | null = null;
    if (input.groupSlug) {
      const group = await friendGroups.getBySlugOrPrevious(input.groupSlug);
      assertFound(group, "Group not found");
      const membership = await friendGroups.getMembership(group.id, userId);
      if (!membership) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "You are not a member of this group");
      }
      groupId = group.id;
      groupSlug = group.slug;
      groupName = group.name;
    }

    // Group collections stay alphabetical (`sort_order: 0` falls through to
    // name ordering in `listAccessibleForUser`). Personal collections get
    // appended to the user's list via max+1.
    const sortOrder = groupId ? 0 : await collections.nextPersonalSortOrder(userId);
    const row = await collections.create({
      userId: groupId ? null : userId,
      groupId,
      name: input.name,
      description: input.description ?? null,
      isInbox: false,
      sortOrder,
    });

    // Deck-building availability is now a per-viewer preference, not a column.
    // The type default is "available if it's my own collection" (group_id IS
    // NULL), so a personal collection only needs an explicit row when the
    // creator opts it OUT. Group collections default off and are opted in via
    // the per-member toggle, so we ignore an `available: true` hint here.
    let availableForDeckbuilding = groupId === null;
    if (groupId === null && input.availableForDeckbuilding === false) {
      await collectionDeckbuildingPrefs.set(userId, row.id, false);
      availableForDeckbuilding = false;
    }

    return toCollection({
      ...row,
      availableForDeckbuilding,
      copyCount: 0,
      groupSlug,
      groupName,
      viewerCanAdmin: true,
    });
  }),

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  get: os.get.handler(async ({ input, context }): Promise<CollectionResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const access = await repos.collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const value = await repos.marketplace.singleCollectionValue(input.id, favMarketplace);
    return toCollection({ ...access.collection, viewerCanAdmin: access.viewerCanAdmin }, value);
  }),

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  update: os.update.handler(async ({ input, context }): Promise<CollectionResponse> => {
    const { collections } = context.repos;
    const userId = context.userId;
    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can edit this collection");
    }
    const updates = buildPatchUpdates<Updateable<CollectionsTable>>(input, patchFields);
    const row = await collections.updateById(input.id, updates);
    assertFound(row, "Not found");
    return toCollection({
      ...row,
      // Deck-building availability is per-viewer and untouched by this
      // admin-gated edit; carry over the value resolved during access check.
      availableForDeckbuilding: access.collection.availableForDeckbuilding,
      groupSlug: access.collection.groupSlug,
      groupName: access.collection.groupName,
      viewerCanAdmin: access.viewerCanAdmin,
    });
  }),

  // ── DELETE /collections/:id ─────────────────────────────────────────────────
  // Personal: blocks inbox, moves remaining copies to inbox, then deletes.
  // Shared: requires group admin. There's no group "inbox" — deletion fails if
  // the collection still has copies. The UI surfaces this.
  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const transact = context.transact;
    const { ensureInbox, deleteCollection: deleteCollectionService } = context.services;
    const userId = context.userId;

    const access = await repos.collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can delete this collection");
    }

    const { collection } = access;
    if (collection.isInbox) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete inbox collection");
    }

    if (collection.groupId) {
      const copies = await repos.collections.listCopiesInCollection(input.id);
      if (copies.length > 0) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Empty the shared collection before deleting it",
        );
      }
      await repos.collections.deleteById(input.id);
      return;
    }

    const inboxId = await ensureInbox(repos, userId);
    await deleteCollectionService(transact, {
      collectionId: input.id,
      collectionName: collection.name,
      moveCopiesTo: inboxId,
      targetName: "Inbox",
      userId,
    });
  }),

  // ── POST /collections/:id/clear ─────────────────────────────────────────────
  // Removes every copy from the collection but keeps the collection itself.
  // Built for the inbox (which can never be deleted, so "clear" is its
  // delete-equivalent), but allowed for any collection the viewer administers.
  // Copies pinned by a live trade or loan stay put and are reported back.
  clear: os.clear.handler(async ({ input, context }): Promise<ClearCollectionResponse> => {
    const repos = context.repos;
    const transact = context.transact;
    const { clearCollection: clearCollectionService } = context.services;
    const userId = context.userId;

    const access = await repos.collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can clear this collection");
    }

    return clearCollectionService(transact, { collectionId: input.id, userId });
  }),

  // ── GET /collections/:id/copies ─────────────────────────────────────────────
  copies: os.copies.handler(async ({ input, context }): Promise<CopyListResponse> => {
    const { collections, copies } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");

    const effectiveLimit = clampCopiesLimit(input.limit);
    const rows = await copies.listForCollection(input.id, effectiveLimit, input.cursor);
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);
    const lastItem = items.at(-1);

    return {
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore && lastItem ? buildCopiesCursor(lastItem.createdAt, lastItem.id) : null,
    };
  }),

  // ── POST /collections/:id/share ───────────────────────────────────────────
  // Enables sharing and returns the share token + is_public=true. Idempotent:
  // re-sharing an already-shared collection returns the EXISTING token unchanged
  // rather than minting a new one. Use POST /share/rotate to deliberately churn
  // the token. Personal owners or group admins only.
  share: os.share.handler(async ({ input, context }): Promise<CollectionShareResponse> => {
    const { collections } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can share this collection");
    }

    // Idempotent: if already public with a token, hand back the existing state.
    if (access.collection.isPublic && access.collection.shareToken) {
      return { shareToken: access.collection.shareToken, isPublic: true };
    }

    const token = generateShareToken();
    const updated = await collections.setShareTokenById(input.id, token, true);
    assertFound(updated, "Not found");

    return { shareToken: token, isPublic: true };
  }),

  // ── GET /collections/:id/share ────────────────────────────────────────────
  // Reports the current share state. Owner/group-admin only. An owned-but-
  // unshared collection returns { shareToken: null, isPublic: false } — it does
  // NOT 404 (404 is reserved for collections the viewer can't access at all).
  shareState: os.shareState.handler(
    async ({ input, context }): Promise<CollectionShareResponse> => {
      const { collections } = context.repos;
      const userId = context.userId;

      const access = await collections.getAccessForUser(input.id, userId);
      assertFound(access, "Not found");
      if (!access.viewerCanAdmin) {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          "Only admins can view this collection's share state",
        );
      }

      return {
        shareToken: access.collection.shareToken,
        isPublic: access.collection.isPublic,
      };
    },
  ),

  // ── POST /collections/:id/share/rotate ────────────────────────────────────
  // Mints a NEW share token, invalidating the old one (old links 404 forever),
  // and ensures is_public=true. If the collection isn't shared yet, this acts as
  // "share now" — the repo's setShareTokenById handles both cases identically.
  // Owner/group-admin only.
  rotateShare: os.rotateShare.handler(
    async ({ input, context }): Promise<CollectionShareResponse> => {
      const { collections } = context.repos;
      const userId = context.userId;

      const access = await collections.getAccessForUser(input.id, userId);
      assertFound(access, "Not found");
      if (!access.viewerCanAdmin) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can rotate this share link");
      }

      const token = generateShareToken();
      const updated = await collections.setShareTokenById(input.id, token, true);
      assertFound(updated, "Not found");

      return { shareToken: token, isPublic: true };
    },
  ),

  // ── DELETE /collections/:id/share ─────────────────────────────────────────
  // Nulls the share token and flips is_public=false. Old links 404 forever.
  unshare: os.unshare.handler(async ({ input, context }): Promise<void> => {
    const { collections } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can unshare this collection");
    }

    const updated = await collections.setShareTokenById(input.id, null, false);
    assertFound(updated, "Not found");
  }),

  // ── GET /collections/:id/group-shares ─────────────────────────────────────
  // "Shared with N groups" badge on the collection page. Scoped to personal
  // collections the viewer owns; non-owned/pooled collections 404.
  groupShares: os.groupShares.handler(
    async ({ input, context }): Promise<CollectionGroupSharesResponse> => {
      const { collections, friendGroups } = context.repos;
      const userId = context.userId;

      const access = await collections.getAccessForUser(input.id, userId);
      assertFound(access, "Not found");
      if (access.collection.userId !== userId) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not found");
      }

      const items = await friendGroups.groupsSharingCollection(input.id);
      return { items };
    },
  ),

  // ── POST /collections/reset ───────────────────────────────────────────────
  // Danger-zone reset: wipes every copy from the user's personal collections,
  // deletes every personal collection except the inbox (created if missing),
  // and prunes lists the wipe emptied (no entries left, no dynamic rules).
  // Group collections are untouched. 409s while copies are reserved in active
  // trades or out on loans.
  resetAll: os.resetAll.handler(async ({ context }): Promise<ResetCollectionsResponse> => {
    const { resetCollections } = context.services;
    return await resetCollections(context.transact, context.userId);
  }),

  // ── POST /collections/reorder ─────────────────────────────────────────────
  // Bulk reorder for the user's personal collections. Group-owned rows are
  // silently ignored (they stay alphabetical) so the client can pass any
  // visible-order subset without filtering first.
  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { collections } = context.repos;
    const userId = context.userId;
    await collections.reorderPersonal(userId, input.orderedIds);
  }),

  // ── PUT /collections/:id/deckbuilding ──────────────────────────────────────
  // Sets the *caller's own* deck-building availability for a collection. This
  // is a per-viewer preference, so any member with access may set it for
  // themselves — including for shared group collections (not admin-gated).
  setDeckbuilding: os.setDeckbuilding.handler(async ({ input, context }): Promise<void> => {
    const { collections, collectionDeckbuildingPrefs } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");

    await collectionDeckbuildingPrefs.set(userId, input.id, input.available);
  }),
};
