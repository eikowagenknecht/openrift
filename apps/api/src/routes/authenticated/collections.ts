import { collectionsContract } from "@openrift/shared/contracts/collections";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  ClearCollectionResponse,
  CollectionListResponse,
  CollectionResponse,
  CollectionShareResponse,
  CopyListResponse,
  ResetCollectionsResponse,
} from "@openrift/shared/types/api/collection";
import type { CollectionGroupSharesResponse } from "@openrift/shared/types/api/friend-group";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { CollectionsTable } from "../../db/index.js";
import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import type { HomeDeck } from "../../lib/collection-presenters.js";
import { toCollection } from "../../lib/collection-presenters.js";
import { clampCopiesLimit } from "../../lib/copies-page-limit.js";
import { toCopy } from "../../lib/copy-presenters.js";
import { keysetPage } from "../../lib/keyset-cursor.js";
import { getFavoriteMarketplace } from "../../lib/preferences.js";
import { generateShareToken } from "../../lib/share-token.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";

const patchFields: FieldMapping<Updateable<CollectionsTable>> = {
  name: "name",
  description: "description",
  sortOrder: "sortOrder",
};

const os = implement(collectionsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Which of the caller's decks live in which collection, so a collection can
 * present itself as a deck box. Scoped to the caller, so a group member never
 * learns where another member stores their decks.
 */
async function homeDecksByCollection(
  repos: ApiContext["repos"],
  userId: string,
): Promise<Map<string, HomeDeck[]>> {
  const rows = await repos.decks.listHomeCollectionDecks(userId);
  const byCollection = new Map<string, HomeDeck[]>();
  for (const row of rows) {
    const bucket = byCollection.get(row.collectionId);
    if (bucket) {
      bucket.push({ id: row.id, name: row.name });
    } else {
      byCollection.set(row.collectionId, [{ id: row.id, name: row.name }]);
    }
  }
  return byCollection;
}

/**
 * Authenticated collections contract (mounted at `/api/v1/collections`).
 * Not-found / forbidden / conflict states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const collectionsRouter = {
  list: os.list.handler(async ({ context }): Promise<CollectionListResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const rows = await repos.collections.listAccessibleForUser(userId);
    const [values, homeDecks] = await Promise.all([
      repos.marketplace.collectionValues(
        rows.map((row) => row.id),
        favMarketplace,
      ),
      homeDecksByCollection(repos, userId),
    ]);
    return {
      items: rows.map((row) => toCollection(row, values.get(row.id), homeDecks.get(row.id))),
    };
  }),

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

    // Deck-building availability is a per-viewer preference, not a column.
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

  get: os.get.handler(async ({ input, context }): Promise<CollectionResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const access = await repos.collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const value = await repos.marketplace.singleCollectionValue(input.id, favMarketplace);
    const homeDecks = await homeDecksByCollection(repos, userId);
    return toCollection(
      { ...access.collection, viewerCanAdmin: access.viewerCanAdmin },
      value,
      homeDecks.get(input.id),
    );
  }),

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
    // A rename doesn't touch which decks live here, but the response is a full
    // collection — resolve them so it doesn't read as "no decks".
    const homeDecks = await homeDecksByCollection(context.repos, userId);
    return toCollection(
      {
        ...row,
        // Deck-building availability is per-viewer and untouched by this
        // admin-gated edit; carry over the value resolved during access check.
        availableForDeckbuilding: access.collection.availableForDeckbuilding,
        groupSlug: access.collection.groupSlug,
        groupName: access.collection.groupName,
        viewerCanAdmin: access.viewerCanAdmin,
      },
      undefined,
      homeDecks.get(input.id),
    );
  }),

  // There is no group inbox, so a shared collection must be emptied before
  // deletion (the UI surfaces this); a personal collection's remaining copies
  // move to the owner's inbox.
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

  copies: os.copies.handler(async ({ input, context }): Promise<CopyListResponse> => {
    const { collections, copies } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");

    const effectiveLimit = clampCopiesLimit(input.limit);
    const rows = await copies.listForCollection(input.id, effectiveLimit, input.cursor);

    return keysetPage(rows, effectiveLimit, toCopy);
  }),

  // Idempotent: returns the existing token unchanged. Use rotate to churn it.
  share: os.share.handler(async ({ input, context }): Promise<CollectionShareResponse> => {
    const { collections } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can share this collection");
    }

    if (access.collection.isPublic && access.collection.shareToken) {
      return { shareToken: access.collection.shareToken, isPublic: true };
    }

    const token = generateShareToken();
    const updated = await collections.setShareTokenById(input.id, token, true);
    assertFound(updated, "Not found");

    return { shareToken: token, isPublic: true };
  }),

  // An owned-but-unshared collection returns { shareToken: null, isPublic:
  // false } — it does NOT 404 (404 is reserved for collections the viewer
  // can't access at all).
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

  // Mints a NEW share token, invalidating the old one (old links 404 forever).
  // If the collection isn't shared yet, this acts as "share now" — the repo's
  // setShareTokenById handles both cases identically.
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

  // Backs the "Shared with N groups" badge on the collection page.
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

  // Danger-zone reset: wipes personal collections only (inbox kept, created if
  // missing; group collections untouched) and prunes lists the wipe emptied.
  // 409s while copies are reserved in active trades or out on loans.
  resetAll: os.resetAll.handler(async ({ context }): Promise<ResetCollectionsResponse> => {
    const { resetCollections } = context.services;
    return await resetCollections(context.transact, context.userId);
  }),

  // Group-owned rows are silently ignored (they stay alphabetical) so the
  // client can pass any visible-order subset without filtering first.
  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { collections } = context.repos;
    const userId = context.userId;
    await collections.reorderPersonal(userId, input.orderedIds);
  }),

  // Deck-building availability is a per-viewer preference, so any member with
  // access may set it for themselves — including for shared group collections
  // (not admin-gated).
  setDeckbuilding: os.setDeckbuilding.handler(async ({ input, context }): Promise<void> => {
    const { collections, collectionDeckbuildingPrefs } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");

    await collectionDeckbuildingPrefs.set(userId, input.id, input.available);
  }),

  // Pushes the collection behind the sidebar's "Show more" toggle for the
  // caller only. Per-viewer like deck-building availability, so members of a
  // shared group collection can each curate their own sidebar (not
  // admin-gated).
  setSidebarHidden: os.setSidebarHidden.handler(async ({ input, context }): Promise<void> => {
    const { collections, collectionSidebarPrefs } = context.repos;
    const userId = context.userId;

    const access = await collections.getAccessForUser(input.id, userId);
    assertFound(access, "Not found");

    await collectionSidebarPrefs.set(userId, input.id, input.hidden);
  }),
};
