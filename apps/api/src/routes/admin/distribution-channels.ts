import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { DistributionChannelResponse } from "@openrift/shared";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { createDistributionChannelSchema, updateDistributionChannelSchema } from "./schemas.js";

const channelSchema = z.object({
  id: z.string().openapi({ example: "019d4999-4219-72f6-b7bb-64004e1b1bff" }),
  slug: z.string().openapi({ example: "nexus-night-2025" }),
  label: z.string().openapi({ example: "Nexus Night 2025" }),
  description: z.string().nullable().openapi({ example: null }),
  kind: z.enum(["event", "product"]).openapi({ example: "event" }),
  sortOrder: z.number().openapi({ example: 0 }),
  parentId: z.string().nullable().openapi({ example: null }),
  childrenLabel: z.string().nullable().openapi({ example: null }),
  createdAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
});

const listChannels = createRoute({
  method: "get",
  path: "/distribution-channels",
  tags: ["Admin - Distribution Channels"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ distributionChannels: z.array(channelSchema) }),
        },
      },
      description: "List distribution channels",
    },
  },
});

const createChannel = createRoute({
  method: "post",
  path: "/distribution-channels",
  tags: ["Admin - Distribution Channels"],
  request: {
    body: { content: { "application/json": { schema: createDistributionChannelSchema } } },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: z.object({ distributionChannel: channelSchema }) },
      },
      description: "Distribution channel created",
    },
  },
});

const updateChannel = createRoute({
  method: "patch",
  path: "/distribution-channels/{id}",
  tags: ["Admin - Distribution Channels"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateDistributionChannelSchema } } },
  },
  responses: { 204: { description: "Distribution channel updated" } },
});

const deleteChannel = createRoute({
  method: "delete",
  path: "/distribution-channels/{id}",
  tags: ["Admin - Distribution Channels"],
  request: { params: idParamSchema },
  responses: { 204: { description: "Distribution channel deleted" } },
});

const reorderChannels = createRoute({
  method: "put",
  path: "/distribution-channels/reorder",
  tags: ["Admin - Distribution Channels"],
  request: {
    body: {
      content: {
        "application/json": { schema: z.object({ ids: z.array(z.string().min(1)).min(1) }) },
      },
    },
  },
  responses: { 204: { description: "Distribution channels reordered" } },
});

export const adminDistributionChannelsRoute = new OpenAPIHono<{ Variables: Variables }>()
  .openapi(listChannels, async (c) => {
    const { distributionChannels: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({
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
        }),
      ),
    });
  })
  .openapi(reorderChannels, async (c) => {
    const { distributionChannels: repo } = c.get("repos");
    const { ids } = c.req.valid("json");
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
    return c.body(null, 204);
  })
  .openapi(createChannel, async (c) => {
    const { distributionChannels: repo } = c.get("repos");
    const { slug, label, description, kind, parentId, childrenLabel } = c.req.valid("json");
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
    return c.json({ distributionChannel: created }, 201);
  })
  .openapi(updateChannel, async (c) => {
    const { distributionChannels: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = await repo.getById(id);
    assertFound(existing, "Distribution channel not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    // When the parent changes, append the row to the new sibling group's end so
    // sort orders don't collide with existing siblings under that parent.
    const parentChanged =
      body.parentId !== undefined && (body.parentId ?? null) !== existing.parentId;
    const updates = { ...body, parentId: body.parentId ?? null };
    if (parentChanged) {
      const maxSortOrder = await repo.getMaxSortOrderForParent(updates.parentId);
      await repo.update(id, { ...updates, sortOrder: maxSortOrder + 1 });
    } else {
      await repo.update(id, updates);
    }
    return c.body(null, 204);
  })
  .openapi(deleteChannel, async (c) => {
    const { distributionChannels: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const existing = await repo.getById(id);
    assertFound(existing, "Distribution channel not found");
    const inUse = await repo.isInUse(id);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: distribution channel is in use by one or more printings",
      );
    }
    await repo.deleteById(id);
    return c.body(null, 204);
  });
