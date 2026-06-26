import { ERROR_CODES } from "@openrift/shared";
import type { MarkerResponse } from "@openrift/shared";
import { adminMarkersContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertFound } from "../../utils/assertions.js";

const os = implement(adminMarkersContract).$context<ApiContext>().use(requireUser);

function toMarkerResponse(row: {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): MarkerResponse {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Admin markers taxonomy CRUD. Markers are keyed by their UUID `id`. Conflict /
 * not-found / in-use states are thrown as `AppError` and mapped by the
 * handler's {@link appErrorInterceptor}.
 */
export const adminMarkersRouter = {
  list: os.list.handler(async ({ context }) => {
    const { markers: repo } = context.repos;
    const rows = await repo.listAll();
    return { markers: rows.map((row) => toMarkerResponse(row)) };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { markers: repo } = context.repos;
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
    const knownIds = new Set(all.map((m) => m.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown marker ids: ${unknown.join(", ")}`);
    }
    await repo.reorder(ids);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { markers: repo } = context.repos;
    const { slug, label, description } = input;
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Marker "${slug}" already exists`);
    }
    const maxSortOrder = await repo.getMaxSortOrder();
    const created = await repo.create({ slug, label, description, sortOrder: maxSortOrder + 1 });
    return { marker: toMarkerResponse(created) };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { markers: repo } = context.repos;
    const { id, slug, label, description } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Marker not found");
    if (slug !== undefined && slug !== existing.slug) {
      const conflict = await repo.getBySlug(slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${slug}" already in use`);
      }
    }
    await repo.update(id, { slug, label, description });
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { markers: repo } = context.repos;
    const { id } = input;
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
  }),
};
