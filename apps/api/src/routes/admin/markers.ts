import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { MarkerResponse } from "@openrift/shared";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { createMarkerSchema, updateMarkerSchema } from "./schemas.js";

const markerSchema = z.object({
  id: z.string().openapi({ example: "019d4999-4219-72f6-b7bb-64004e1b1bff" }),
  slug: z.string().openapi({ example: "top-8" }),
  label: z.string().openapi({ example: "Top 8" }),
  description: z.string().nullable().openapi({ example: "Top 8 placement stamp" }),
  sortOrder: z.number().openapi({ example: 0 }),
  createdAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
});

const listMarkers = createRoute({
  method: "get",
  path: "/markers",
  tags: ["Admin - Markers"],
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ markers: z.array(markerSchema) }) },
      },
      description: "List markers",
    },
  },
});

const createMarker = createRoute({
  method: "post",
  path: "/markers",
  tags: ["Admin - Markers"],
  request: { body: { content: { "application/json": { schema: createMarkerSchema } } } },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ marker: markerSchema }) } },
      description: "Marker created",
    },
  },
});

const updateMarker = createRoute({
  method: "patch",
  path: "/markers/{id}",
  tags: ["Admin - Markers"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateMarkerSchema } } },
  },
  responses: { 204: { description: "Marker updated" } },
});

const deleteMarker = createRoute({
  method: "delete",
  path: "/markers/{id}",
  tags: ["Admin - Markers"],
  request: { params: idParamSchema },
  responses: { 204: { description: "Marker deleted" } },
});

const reorderMarkers = createRoute({
  method: "put",
  path: "/markers/reorder",
  tags: ["Admin - Markers"],
  request: {
    body: {
      content: {
        "application/json": { schema: z.object({ ids: z.array(z.string().min(1)).min(1) }) },
      },
    },
  },
  responses: { 204: { description: "Markers reordered" } },
});

export const adminMarkersRoute = new OpenAPIHono<{ Variables: Variables }>()
  .openapi(listMarkers, async (c) => {
    const { markers: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({
      markers: rows.map(
        (r): MarkerResponse => ({
          id: r.id,
          slug: r.slug,
          label: r.label,
          description: r.description,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })
  .openapi(reorderMarkers, async (c) => {
    const { markers: repo } = c.get("repos");
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
    const knownIds = new Set(all.map((m) => m.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown marker ids: ${unknown.join(", ")}`);
    }
    await repo.reorder(ids);
    return c.body(null, 204);
  })
  .openapi(createMarker, async (c) => {
    const { markers: repo } = c.get("repos");
    const { slug, label, description } = c.req.valid("json");
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Marker "${slug}" already exists`);
    }
    const maxSortOrder = await repo.getMaxSortOrder();
    const created = await repo.create({ slug, label, description, sortOrder: maxSortOrder + 1 });
    return c.json({ marker: created }, 201);
  })
  .openapi(updateMarker, async (c) => {
    const { markers: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = await repo.getById(id);
    assertFound(existing, "Marker not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    await repo.update(id, body);
    return c.body(null, 204);
  })
  .openapi(deleteMarker, async (c) => {
    const { markers: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const existing = await repo.getById(id);
    assertFound(existing, "Marker not found");
    const inUse = await repo.isInUse(id);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: marker is in use by one or more printings",
      );
    }
    await repo.deleteById(id);
    return c.body(null, 204);
  });
