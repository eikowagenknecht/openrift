import { ERROR_CODES } from "@openrift/shared";
import type { DistributionChannelResponse } from "@openrift/shared";
import { adminDistributionChannelsContract } from "@openrift/shared/contracts/admin/distribution-channels";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertFound, assertSlugAvailable, assertValidReorder } from "../../lib/assertions.js";
import { raisedExceptionMessage } from "../../lib/pg-errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminDistributionChannelsContract)
  .$context<ApiContext>()
  .use(requireAuthedUser);

/**
 * Maps a hierarchy-trigger rejection (cycle, kind mismatch, depth cap, parent
 * already has printings) to a 409; the trigger's message is already human-readable.
 */
function asHierarchyConflict(error: unknown): unknown {
  const raised = raisedExceptionMessage(error);
  if (raised === null) {
    return error;
  }
  return new AppError(409, ERROR_CODES.CONFLICT, raised);
}

/**
 * Channels are keyed by their UUID `id` and may nest via `parentId`.
 */
export const adminDistributionChannelsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { distributionChannels: repo } = context.repos;
    const [rows, counts] = await Promise.all([repo.listAll(), repo.usageCountsByChannel()]);
    const countById = new Map(counts.map((row) => [row.channelId, row.count]));
    return {
      distributionChannels: rows.map((r): DistributionChannelResponse => ({
        id: r.id,
        slug: r.slug,
        label: r.label,
        description: r.description,
        kind: r.kind,
        sortOrder: r.sortOrder,
        parentId: r.parentId,
        childrenLabel: r.childrenLabel,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        printingCount: countById.get(r.id) ?? 0,
      })),
    };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { distributionChannels: repo } = context.repos;
    const { ids } = input;
    const all = await repo.listAll();
    assertValidReorder(ids, all, {
      keyOf: (row) => row.id,
      keyNoun: "ids",
      unknownLabel: "distribution channel ids",
    });
    await repo.reorder(ids);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { distributionChannels: repo } = context.repos;
    const { slug, label, description, kind, parentId, childrenLabel } = input;
    const existing = await repo.getBySlug(slug);
    assertSlugAvailable(existing, slug, "Distribution channel");
    const resolvedParentId = parentId ?? null;
    const maxSortOrder = await repo.getMaxSortOrderForParent(resolvedParentId);
    const created = await repo
      .create({
        slug,
        label,
        description,
        kind,
        parentId: resolvedParentId,
        childrenLabel: childrenLabel ?? null,
        sortOrder: maxSortOrder + 1,
      })
      .catch((error: unknown) => {
        throw asHierarchyConflict(error);
      });
    const distributionChannel: DistributionChannelResponse = {
      id: created.id,
      slug: created.slug,
      label: created.label,
      description: created.description,
      kind: created.kind,
      sortOrder: created.sortOrder,
      parentId: created.parentId,
      childrenLabel: created.childrenLabel,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      printingCount: 0,
    };
    return { distributionChannel };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { distributionChannels: repo } = context.repos;
    const { id, ...body } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Distribution channel not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    // Coercing an absent `parentId` to null here would reparent every
    // channel to the root on any partial edit.
    const updates = { ...body };
    if (Object.keys(updates).length === 0) {
      return;
    }
    const parentChanged =
      body.parentId !== undefined && (body.parentId ?? null) !== existing.parentId;
    try {
      if (parentChanged) {
        const parentId = body.parentId ?? null;
        const maxSortOrder = await repo.getMaxSortOrderForParent(parentId);
        await repo.update(id, { ...updates, parentId, sortOrder: maxSortOrder + 1 });
      } else {
        await repo.update(id, updates);
      }
    } catch (error) {
      throw asHierarchyConflict(error);
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { distributionChannels: repo } = context.repos;
    const { id } = input.params;
    const force = input.query.force === "true";
    const existing = await repo.getById(id);
    assertFound(existing, "Distribution channel not found");
    const childRow = await repo.hasChildren(id);
    if (childRow) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: distribution channel has child channels. Remove or reparent them first.",
      );
    }
    const usageCount = await repo.countInUse(id);
    if (usageCount > 0 && !force) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `Cannot delete: distribution channel is in use by ${usageCount} printing${usageCount === 1 ? "" : "s"}. Pass force=true to unlink and delete.`,
      );
    }
    if (usageCount > 0) {
      await repo.deleteLinksForChannel(id);
    }
    await repo.deleteById(id);
  }),
};
