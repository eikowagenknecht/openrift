import { ERROR_CODES } from "@openrift/shared";
import type { Selectable } from "kysely";

import type { Database, ReferenceTable } from "../db/index.js";
import { AppError } from "../errors.js";
import type { ApiContext } from "../orpc/context.js";
import type { SlugTaxonomyRepo, SlugTaxonomyTable } from "../repositories/slug-taxonomy.js";
import { assertSlugAvailable, assertValidReorder } from "./assertions.js";

/**
 * Config for one slug-keyed admin taxonomy router (finishes, domains,
 * rarities, art variants, card types, super types, deck formats). Everything
 * the seven routers do NOT share lives here; everything they do share lives
 * in {@link createSlugTaxonomyHandlers}.
 */
export interface SlugTaxonomyRouterConfig<T extends SlugTaxonomyTable, CreateKey extends string> {
  /** `context.repos` key for this taxonomy; doubles as the `list` response key. */
  repoKey: T;
  /**
   * Display noun for error messages, e.g. `"Finish"`, `"Art variant"`. Used
   * as-is in not-found/already-exists messages, lowercased for the
   * well-known/in-use ones and for the reorder unknown-slugs label.
   */
  entityName: string;
  /** The `create` response key, e.g. `"finish"` for the `"finishes"` repo. */
  createKey: CreateKey;
  /** What references a row, e.g. `"one or more printings"`, `"one or more cards"`. */
  inUseBy: string;
  /** Whether create/update accept the optional hex `color` (rarities, domains only). */
  hasColor?: boolean;
  /** Extra work to run after a successful reorder (finishes: refreshCanonicalRank). */
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

/**
 * Builds `{ [key]: value }` typed as a proper mapped type instead of the
 * widened `{ [x: string]: V }` a plain computed-property literal would infer,
 * so callers get back the exact response shape their contract expects.
 * @returns The single-key object.
 */
function keyed<K extends string, V>(key: K, value: V): Record<K, V> {
  return { [key]: value } as Record<K, V>;
}

/**
 * Return shape of {@link createSlugTaxonomyHandlers}, spelled out explicitly
 * because Kysely's `Selectable<Database[T]>` pulls in an internal type-utils
 * type TS can't print from an inferred return position.
 */
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

/**
 * Builds the five CRUD handlers shared by the slug-keyed admin taxonomy
 * routers. Each router file wires these into its own contract-bound `os.*`
 * procedures (`os.list.handler(handlers.list)`, etc.), so every route path,
 * method, status code and error code still comes from that router's own
 * contract — only the handler bodies are shared here.
 *
 * `T` is generic across the seven taxonomy tables, so the repo lookups below
 * go through a type-only redirection (`Record<T, SlugTaxonomyRepo<T>>`) the
 * same way {@link SlugTaxonomyRepo}'s own factory redirects through
 * `TaxonomyDb`: the real, precisely-typed repo is what a caller sees once `T`
 * is instantiated to a specific table via `config.repoKey`.
 *
 * @returns The `{ list, reorder, create, update, remove }` handler functions.
 */
export function createSlugTaxonomyHandlers<T extends SlugTaxonomyTable, CreateKey extends string>(
  config: SlugTaxonomyRouterConfig<T, CreateKey>,
): SlugTaxonomyHandlers<T, CreateKey> {
  const { repoKey, entityName, createKey, inUseBy, hasColor, afterReorder } = config;
  const entityLower = entityName.toLowerCase();

  function repoOf(context: ApiContext): SlugTaxonomyRepo<T> {
    const repos = context.repos as unknown as Record<T, SlugTaxonomyRepo<T>>;
    return repos[repoKey];
  }

  // T stays generic across the seven tables, so a row typed `Selectable<Database[T]>`
  // is opaque here (TS can't see through it to `ReferenceTable`'s columns the way
  // it can once `T` is instantiated to a literal table at each router's call site).
  // Every one of the seven tables carries the full `ReferenceTable` shape, so this
  // redirection is safe — same trick as `TaxonomyDb` in slug-taxonomy.ts.
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
