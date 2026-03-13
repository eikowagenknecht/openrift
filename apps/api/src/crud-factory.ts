import { Hono } from "hono";
import type { Context } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "./db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "./errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "./middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "./middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { buildPatchUpdates } from "./patch.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { FieldMapping } from "./patch.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "./types.js";

type CrudOperation = "list" | "create" | "getOne" | "update" | "delete";
type OrderByClause = [field: string, direction?: "asc" | "desc"];
type AppContext = Context<{ Variables: Variables }>;

interface CrudRouteConfig {
  path: string;
  table: string;
  toDto: (row: object) => unknown;
  createSchema: { parse(data: unknown): Record<string, unknown> };
  updateSchema: { parse(data: unknown): Record<string, unknown> };
  toInsert: (body: Record<string, unknown>) => Record<string, unknown>;
  patchFields: FieldMapping;
  orderBy?: string | OrderByClause[];
  skip?: CrudOperation[];
  beforeList?: (c: AppContext) => Promise<void>;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely query builder loses type info with dynamic tables
  listFilter?: (query: any, c: AppContext) => any;
}

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table names lose Kysely's static types
const dynDb = db as any;

export function createCrudRoute(config: CrudRouteConfig): Hono<{ Variables: Variables }> {
  const {
    path,
    table,
    toDto,
    createSchema,
    updateSchema,
    toInsert,
    patchFields,
    orderBy = "name",
    skip = [],
    beforeList,
    listFilter,
  } = config;

  const skipped = new Set(skip);
  const route = new Hono<{ Variables: Variables }>();

  route.use(`${path}/*`, requireAuth);
  route.use(path, requireAuth);

  if (!skipped.has("list")) {
    route.get(path, async (c) => {
      if (beforeList) {
        await beforeList(c);
      }
      const userId = getUserId(c);
      let query = dynDb.selectFrom(table).selectAll().where("user_id", "=", userId);

      if (Array.isArray(orderBy)) {
        for (const [field, dir] of orderBy) {
          query = query.orderBy(field, dir);
        }
      } else {
        query = query.orderBy(orderBy);
      }

      if (listFilter) {
        query = listFilter(query, c);
      }

      const rows = await query.execute();
      return c.json(rows.map((row: object) => toDto(row)));
    });
  }

  if (!skipped.has("create")) {
    route.post(path, async (c) => {
      const userId = getUserId(c);
      const body = createSchema.parse(await c.req.json());
      const row = await dynDb
        .insertInto(table)
        .values({ user_id: userId, ...toInsert(body) })
        .returningAll()
        .executeTakeFirstOrThrow();
      return c.json(toDto(row as object), 201);
    });
  }

  if (!skipped.has("getOne")) {
    route.get(`${path}/:id`, async (c) => {
      const userId = getUserId(c);
      const row = await dynDb
        .selectFrom(table)
        .selectAll()
        .where("id", "=", c.req.param("id"))
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toDto(row as object));
    });
  }

  if (!skipped.has("update")) {
    route.patch(`${path}/:id`, async (c) => {
      const userId = getUserId(c);
      const body = updateSchema.parse(await c.req.json());
      const updates = buildPatchUpdates(body, patchFields);
      const row = await dynDb
        .updateTable(table)
        .set(updates)
        .where("id", "=", c.req.param("id"))
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toDto(row as object));
    });
  }

  if (!skipped.has("delete")) {
    route.delete(`${path}/:id`, async (c) => {
      const userId = getUserId(c);
      const result = await dynDb
        .deleteFrom(table)
        .where("id", "=", c.req.param("id"))
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (result.numDeletedRows === 0n) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json({ ok: true });
    });
  }

  return route;
}
