import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AcquisitionSourceListResponse } from "@openrift/shared";
import {
  acquisitionSourceListResponseSchema,
  acquisitionSourceResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  createAcquisitionSourceSchema,
  idParamSchema,
  updateAcquisitionSourceSchema,
} from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { toSource } from "../../utils/mappers.js";

const patchFields: FieldMapping = { name: "name", description: "description" };

const listSources = createRoute({
  method: "get",
  path: "/",
  tags: ["Acquisition Sources"],
  responses: {
    200: {
      content: { "application/json": { schema: acquisitionSourceListResponseSchema } },
      description: "Success",
    },
  },
});

const createSource = createRoute({
  method: "post",
  path: "/",
  tags: ["Acquisition Sources"],
  request: {
    body: { content: { "application/json": { schema: createAcquisitionSourceSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: acquisitionSourceResponseSchema } },
      description: "Created",
    },
  },
});

const getSource = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Acquisition Sources"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: acquisitionSourceResponseSchema } },
      description: "Success",
    },
  },
});

const updateSource = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Acquisition Sources"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateAcquisitionSourceSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: acquisitionSourceResponseSchema } },
      description: "Success",
    },
  },
});

const deleteSource = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Acquisition Sources"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const acquisitionSourcesApp = new OpenAPIHono<{
  Variables: Variables;
}>().basePath("/acquisition-sources");
acquisitionSourcesApp.use(requireAuth);
export const acquisitionSourcesRoute = acquisitionSourcesApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listSources, async (c) => {
    const { acquisitionSources } = c.get("repos");
    const rows = await acquisitionSources.listForUser(getUserId(c));
    return c.json({
      items: rows.map((row) => toSource(row)),
    } satisfies AcquisitionSourceListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createSource, async (c) => {
    const { acquisitionSources } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await acquisitionSources.create({
      userId,
      name: body.name,
      description: body.description ?? null,
    });
    return c.json(toSource(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .openapi(getSource, async (c) => {
    const { acquisitionSources } = c.get("repos");
    const { id } = c.req.valid("param");
    const row = await acquisitionSources.getByIdForUser(id, getUserId(c));
    assertFound(row, "Not found");
    return c.json(toSource(row));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .openapi(updateSource, async (c) => {
    const { acquisitionSources } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updates = buildPatchUpdates(body, patchFields);
    const row = await acquisitionSources.update(id, userId, updates);
    assertFound(row, "Not found");
    return c.json(toSource(row));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteSource, async (c) => {
    const { acquisitionSources } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await acquisitionSources.deleteByIdForUser(id, getUserId(c));
    assertDeleted(result, "Not found");
    return c.body(null, 204);
  });
