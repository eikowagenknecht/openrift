import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { LanguageResponse } from "@openrift/shared";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import {
  codeParamSchema,
  createLanguageSchema,
  reorderLanguagesSchema,
  updateLanguageSchema,
} from "./schemas.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const languageSchema = z.object({
  code: z.string().openapi({ example: "EN" }),
  name: z.string().openapi({ example: "English" }),
  sortOrder: z.number().openapi({ example: 1 }),
  createdAt: z.string().openapi({ example: "2026-03-31T19:56:40.945Z" }),
  updatedAt: z.string().openapi({ example: "2026-03-31T19:56:40.945Z" }),
});

// ── Route definitions ───────────────────────────────────────────────────────

const listLanguages = createRoute({
  method: "get",
  path: "/languages",
  tags: ["Admin - Languages"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ languages: z.array(languageSchema) }),
        },
      },
      description: "List languages",
    },
  },
});

const reorderLanguages = createRoute({
  method: "put",
  path: "/languages/reorder",
  tags: ["Admin - Languages"],
  request: {
    body: { content: { "application/json": { schema: reorderLanguagesSchema } } },
  },
  responses: {
    204: { description: "Languages reordered" },
  },
});

const createLanguage = createRoute({
  method: "post",
  path: "/languages",
  tags: ["Admin - Languages"],
  request: {
    body: { content: { "application/json": { schema: createLanguageSchema } } },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({ language: languageSchema }),
        },
      },
      description: "Language created",
    },
  },
});

const updateLanguage = createRoute({
  method: "patch",
  path: "/languages/{code}",
  tags: ["Admin - Languages"],
  request: {
    params: codeParamSchema,
    body: { content: { "application/json": { schema: updateLanguageSchema } } },
  },
  responses: {
    204: { description: "Language updated" },
  },
});

const deleteLanguage = createRoute({
  method: "delete",
  path: "/languages/{code}",
  tags: ["Admin - Languages"],
  request: {
    params: codeParamSchema,
  },
  responses: {
    204: { description: "Language deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminLanguagesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/languages ──────────────────────────────────────────────

  .openapi(listLanguages, async (c) => {
    const { languages: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({
      languages: rows.map(
        (r): LanguageResponse => ({
          code: r.code,
          name: r.name,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  // ── PUT /admin/languages/reorder ──────────────────────────────────────

  .openapi(reorderLanguages, async (c) => {
    const { languages: repo } = c.get("repos");
    const { codes } = c.req.valid("json");

    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate language codes in reorder list.");
    }

    const allLangs = await repo.listAll();
    if (codes.length !== allLangs.length) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Expected ${allLangs.length} language codes, got ${codes.length}.`,
      );
    }

    const knownCodes = new Set(allLangs.map((lang) => lang.code));
    const unknown = codes.filter((code) => !knownCodes.has(code));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown language codes: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(codes);
    return c.body(null, 204);
  })

  // ── POST /admin/languages ─────────────────────────────────────────────

  .openapi(createLanguage, async (c) => {
    const { languages: repo } = c.get("repos");
    const { code, name, sortOrder } = c.req.valid("json");

    const existing = await repo.getByCode(code);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Language "${code}" already exists`);
    }

    const created = await repo.create({ code, name, sortOrder });
    return c.json({ language: created }, 201);
  })

  // ── PATCH /admin/languages/:code ───────────────────────────────────────

  .openapi(updateLanguage, async (c) => {
    const { languages: repo } = c.get("repos");
    const { code } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getByCode(code);
    assertFound(existing, `Language not found`);

    await repo.update(code, body);

    return c.body(null, 204);
  })

  // ── DELETE /admin/languages/:code ──────────────────────────────────────

  .openapi(deleteLanguage, async (c) => {
    const { languages: repo } = c.get("repos");
    const { code } = c.req.valid("param");

    const existing = await repo.getByCode(code);
    assertFound(existing, `Language not found`);

    const inUse = await repo.isInUse(code);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: language is in use by one or more printings",
      );
    }

    await repo.deleteByCode(code);
    return c.body(null, 204);
  });
