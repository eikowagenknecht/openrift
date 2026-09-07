import type {
  TierListListResponse,
  TierListResponse,
  TierListShareResponse,
} from "@openrift/shared";
import { trimToNull } from "@openrift/shared";
import { DEFAULT_TIER_LABELS, tierListsContract } from "@openrift/shared/contracts/tier-lists";
import { implement } from "@orpc/server";

import type { TierListRow } from "../../db/index.js";
import { assertFound } from "../../lib/assertions.js";
import { withUniqueShareToken } from "../../lib/share-token.js";
import { toTierList, toTierListSummary } from "../../lib/tier-list-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const NOT_FOUND = "Tier list not found";

function defaultTiers(): TierListRow[] {
  return DEFAULT_TIER_LABELS.map((label) => ({ label, cards: [] }));
}

/**
 * Trims a nullish free-text field down to what should be stored: `undefined`
 * leaves the column alone, an empty string clears it to null.
 */
function normalizeText(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : trimToNull(value);
}

const os = implement(tierListsContract).$context<ApiContext>().use(requireAuthedUser);

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
    const row = await context.repos.tierLists.create(context.userId, {
      // The contract's `.trim()` already normalized the title.
      title: input.title,
      description: normalizeText(input.description) ?? null,
      tiers: input.tiers ?? defaultTiers(),
    });
    return toTierList(row);
  }),

  update: os.update.handler(async ({ input, context }): Promise<TierListResponse> => {
    const { id, title, description, tiers } = input;
    // An explicit `undefined` key here reaches Kysely's SET clause and nulls the column.
    const values: Parameters<typeof context.repos.tierLists.update>[2] = {};
    if (title !== undefined) {
      values.title = title;
    }
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription !== undefined) {
      values.description = normalizedDescription;
    }
    if (tiers !== undefined) {
      values.tiers = tiers;
    }

    if (Object.keys(values).length === 0) {
      // An empty values object would produce an empty SET, which is invalid SQL.
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

  unshare: os.unshare.handler(async ({ input, context }): Promise<void> => {
    const updated = await context.repos.tierLists.setShare(input.id, context.userId, null, false);
    assertFound(updated, NOT_FOUND);
  }),
};
