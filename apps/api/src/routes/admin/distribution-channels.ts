import { ERROR_CODES } from "@openrift/shared";
import type { DistributionChannelResponse } from "@openrift/shared";
import { adminDistributionChannelsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertFound } from "../../utils/assertions.js";

const os = implement(adminDistributionChannelsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin distribution-channels taxonomy CRUD.
 * Channels are keyed by their UUID `id` and may nest via `parentId`. Logic
 * unchanged from the previous `@hono/zod-openapi` handlers; conflict /
 * not-found / has-children / in-use states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const adminDistributionChannelsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { distributionChannels: repo } = context.repos;
    const [rows, counts] = await Promise.all([repo.listAll(), repo.usageCountsByChannel()]);
    const countById = new Map(counts.map((row) => [row.channelId, row.count]));
    return {
      distributionChannels: rows.map(
        (r): DistributionChannelResponse => ({
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
        }),
      ),
    };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { distributionChannels: repo } = context.repos;
    const { ids } = input;
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate ids in reorder list.");
    }
    const all = await repo.listAll();
    if (ids.length !== all.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${all.length} ids, got ${ids.length}.`,
      );
    }
    const knownIds = new Set(all.map((row) => row.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown distribution channel ids: ${unknown.join(", ")}`,
      );
    }
    await repo.reorder(ids);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { distributionChannels: repo } = context.repos;
    const { slug, label, description, kind, parentId, childrenLabel } = input;
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `Distribution channel "${slug}" already exists`,
      );
    }
    const resolvedParentId = parentId ?? null;
    const maxSortOrder = await repo.getMaxSortOrderForParent(resolvedParentId);
    const created = await repo.create({
      slug,
      label,
      description,
      kind,
      parentId: resolvedParentId,
      childrenLabel: childrenLabel ?? null,
      sortOrder: maxSortOrder + 1,
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
    // When the parent changes, append the row to the new sibling group's end
    // so sort orders don't collide with existing siblings under that parent.
    const parentChanged =
      body.parentId !== undefined && (body.parentId ?? null) !== existing.parentId;
    const updates = { ...body, parentId: body.parentId ?? null };
    if (parentChanged) {
      const maxSortOrder = await repo.getMaxSortOrderForParent(updates.parentId);
      await repo.update(id, { ...updates, sortOrder: maxSortOrder + 1 });
    } else {
      await repo.update(id, updates);
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
