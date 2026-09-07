import { ERROR_CODES } from "@openrift/shared";
import type { Selectable } from "kysely";

import type { Database, ReferenceTable } from "../db/index.js";
import { AppError } from "../errors.js";
import type { ApiContext } from "../orpc/context.js";
import type { SlugTaxonomyRepo, SlugTaxonomyTable } from "../repositories/slug-taxonomy.js";
import { assertSlugAvailable, assertValidReorder } from "./assertions.js";

/** Per-router config for the seven slug-keyed admin taxonomy routers; shared behavior lives in {@link createSlugTaxonomyHandlers}. */
export interface SlugTaxonomyRouterConfig<T extends SlugTaxonomyTable, CreateKey extends string> {
  repoKey: T;
  entityName: string;
  createKey: CreateKey;
  inUseBy: string;
  hasColor?: boolean;
  afterReorder?: (context: ApiContext) => Promise<void>;
}

interface CreateInput {
  slug: string;
  label: string;
  color?: string | null;
}

interface UpdateInput {
  slug: string;
  label?: string;
  color?: string | null;
}

/** Typed as a proper mapped type; a plain computed-property literal would widen to `{ [x: string]: V }`. */
function keyed<K extends string, V>(key: K, value: V): Record<K, V> {
  return { [key]: value } as Record<K, V>;
}

/** Spelled out explicitly: Kysely's `Selectable<Database[T]>` pulls in an internal type TS can't print from an inferred return position. */
export interface SlugTaxonomyHandlers<T extends SlugTaxonomyTable, CreateKey extends string> {
  list: (args: { context: ApiContext }) => Promise<Record<T, Selectable<Database[T]>[]>>;
  reorder: (args: { input: { slugs: string[] }; context: ApiContext }) => Promise<void>;
  create: (args: {
    input: CreateInput;
    context: ApiContext;
  }) => Promise<Record<CreateKey, Selectable<Database[T]>>>;
  update: (args: { input: UpdateInput; context: ApiContext }) => Promise<void>;
  remove: (args: { input: { slug: string }; context: ApiContext }) => Promise<void>;
}

/** Each router wires these into its own contract-bound `os.*` procedures; route, method, status and error code still come from that contract. */
export function createSlugTaxonomyHandlers<T extends SlugTaxonomyTable, CreateKey extends string>(
  config: SlugTaxonomyRouterConfig<T, CreateKey>,
): SlugTaxonomyHandlers<T, CreateKey> {
  const { repoKey, entityName, createKey, inUseBy, hasColor, afterReorder } = config;
  const entityLower = entityName.toLowerCase();

  function repoOf(context: ApiContext): SlugTaxonomyRepo<T> {
    const repos = context.repos as unknown as Record<T, SlugTaxonomyRepo<T>>;
    return repos[repoKey];
  }

  // Every one of the seven tables carries the full `ReferenceTable` shape, so this cast is safe
  // even though T is generic here and TS can't see through it to those columns.
  function asReference(row: Selectable<Database[T]>): ReferenceTable {
    return row as unknown as ReferenceTable;
  }

  return {
    async list({ context }: { context: ApiContext }) {
      const rows = await repoOf(context).listAll();
      return keyed(repoKey, rows);
    },

    async reorder({
      input,
      context,
    }: {
      input: { slugs: string[] };
      context: ApiContext;
    }): Promise<void> {
      const repo = repoOf(context);
      const { slugs } = input;
      const all = await repo.listAll();
      assertValidReorder(slugs, all, {
        keyOf: (row) => asReference(row).slug,
        keyNoun: "slugs",
        unknownLabel: `${entityLower} slugs`,
      });
      await repo.reorder(slugs);
      if (afterReorder) {
        await afterReorder(context);
      }
    },

    async create({ input, context }: { input: CreateInput; context: ApiContext }) {
      const repo = repoOf(context);
      const { slug, label, color } = input;

      const existing = await repo.getBySlug(slug);
      assertSlugAvailable(existing, slug, entityName);

      const created = await repo.create(
        (hasColor ? { slug, label, color } : { slug, label }) as never,
      );
      return keyed(createKey, created);
    },

    async update({ input, context }: { input: UpdateInput; context: ApiContext }): Promise<void> {
      const repo = repoOf(context);

      const existing = await repo.getBySlug(input.slug);
      if (!existing) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, `${entityName} "${input.slug}" not found`);
      }

      if (hasColor) {
        const updates: { label?: string; color?: string | null } = {};
        if (input.label !== undefined) {
          updates.label = input.label;
        }
        if (input.color !== undefined) {
          updates.color = input.color;
        }
        if (Object.keys(updates).length > 0) {
          await repo.update(input.slug, updates as never);
        }
      } else if (input.label) {
        await repo.update(input.slug, { label: input.label } as never);
      }
    },

    async remove({
      input,
      context,
    }: {
      input: { slug: string };
      context: ApiContext;
    }): Promise<void> {
      const repo = repoOf(context);

      const existing = await repo.getBySlug(input.slug);
      if (!existing) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, `${entityName} "${input.slug}" not found`);
      }

      if (asReference(existing).isWellKnown) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Cannot delete a well-known ${entityLower}`);
      }

      const inUse = await repo.isInUse(input.slug);
      if (inUse) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          `Cannot delete: ${entityLower} is in use by ${inUseBy}`,
        );
      }

      await repo.deleteBySlug(input.slug);
    },
  };
}
