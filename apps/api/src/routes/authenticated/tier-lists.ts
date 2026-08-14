import type {
  TierListListResponse,
  TierListResponse,
  TierListShareResponse,
} from "@openrift/shared";
import { DEFAULT_TIER_LABELS, tierListsContract } from "@openrift/shared/contracts/tier-lists";
import { implement } from "@orpc/server";

import type { TierListRow } from "../../db/index.js";
import { assertFound } from "../../lib/assertions.js";
import { withUniqueShareToken } from "../../lib/share-token.js";
import { toTierList, toTierListSummary } from "../../lib/tier-list-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const NOT_FOUND = "Tier list not found";

/** @returns A fresh S/A/B/C/D board, the shape a new list starts from. */
function defaultTiers(): TierListRow[] {
  return DEFAULT_TIER_LABELS.map((label) => ({ label, cardIds: [] }));
}

/**
 * Trims a nullish free-text field down to what should be stored: `undefined`
 * leaves the column alone, an empty string clears it to null.
 * @returns The value to write, or `undefined` to leave the column untouched.
 */
function normalizeText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const os = implement(tierListsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Creator-authored tier lists (migration 237), mounted at `/api/v1/tier-lists`.
 *
 * Every read and write is user-scoped in the repository, so a list belonging to
 * someone else resolves to nothing and surfaces as NOT_FOUND — the caller never
 * learns whether the id exists. Sharing follows the deck precedent exactly:
 * `POST /share` is an idempotent enable, `DELETE /share` clears the token and
 * the flag together so a revoked link stops resolving immediately.
 */
export const tierListsRouter = {
  list: os.list.handler(async ({ context }): Promise<TierListListResponse> => {
    const rows = await context.repos.tierLists.listForUser(context.userId);
    return { items: rows.map((row) => toTierListSummary(row)) };
  }),

  get: os.get.handler(async ({ input, context }): Promise<TierListResponse> => {
    const row = await context.repos.tierLists.getByIdForUser(input.id, context.userId);
    assertFound(row, NOT_FOUND);
    return toTierList(row);
  }),

  create: os.create.handler(async ({ input, context }): Promise<TierListResponse> => {
    // A list with no rows has nothing to drag into, so an omitted board starts
    // on the default ladder rather than empty.
    const row = await context.repos.tierLists.create(context.userId, {
      // The contract's `.trim()` already normalized the title.
      title: input.title,
      description: normalizeText(input.description) ?? null,
      setId: input.setId ?? null,
      tiers: input.tiers ?? defaultTiers(),
    });
    return toTierList(row);
  }),

  update: os.update.handler(async ({ input, context }): Promise<TierListResponse> => {
    const { id, title, description, setId, tiers } = input;
    // Spread-in-place rather than a fully-optional object literal: an explicit
    // `undefined` key would still reach Kysely's SET clause and null the column.
    const values: Parameters<typeof context.repos.tierLists.update>[2] = {};
    if (title !== undefined) {
      values.title = title;
    }
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription !== undefined) {
      values.description = normalizedDescription;
    }
    if (setId !== undefined) {
      values.setId = setId;
    }
    if (tiers !== undefined) {
      values.tiers = tiers;
    }

    if (Object.keys(values).length === 0) {
      // Nothing to write, but the caller still expects the current state — and
      // an empty SET is not valid SQL.
      const current = await context.repos.tierLists.getByIdForUser(id, context.userId);
      assertFound(current, NOT_FOUND);
      return toTierList(current);
    }

    const row = await context.repos.tierLists.update(id, context.userId, values);
    assertFound(row, NOT_FOUND);
    return toTierList(row);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const deleted = await context.repos.tierLists.remove(input.id, context.userId);
    if (!deleted) {
      assertFound(undefined, NOT_FOUND);
    }
  }),

  // Idempotent enable: an already-shared list returns its existing token rather
  // than minting a new one, so re-opening the share dialog never invalidates a
  // link the creator has already put in a video description.
  share: os.share.handler(async ({ input, context }): Promise<TierListShareResponse> => {
    const { tierLists } = context.repos;
    const existing = await tierLists.getShareState(input.id, context.userId);
    assertFound(existing, NOT_FOUND);
    if (existing.shareToken !== null && existing.isPublic) {
      return { shareToken: existing.shareToken, isPublic: true };
    }

    const token = await withUniqueShareToken(async (candidate) => {
      const updated = await tierLists.setShare(input.id, context.userId, candidate, true);
      assertFound(updated, NOT_FOUND);
      return candidate;
    });
    return { shareToken: token, isPublic: true };
  }),

  // Clears the token as well as the flag: re-sharing later mints a fresh one, so
  // a link that was revoked can never come back to life.
  unshare: os.unshare.handler(async ({ input, context }): Promise<void> => {
    const updated = await context.repos.tierLists.setShare(input.id, context.userId, null, false);
    assertFound(updated, NOT_FOUND);
  }),
};
