import { ERROR_CODES, WellKnown } from "@openrift/shared";
import type { DeckFormatConfig } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";

/**
 * Rejects a deck format that isn't in the `deck_formats` reference table. The
 * column FKs to that table, so without this a bad slug surfaces as a raw
 * constraint violation instead of a 400.
 */
export async function assertKnownFormat(
  deckFormats: Repos["deckFormats"],
  format: string,
): Promise<void> {
  const row = await deckFormats.getBySlug(format);
  if (!row) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown deck format: ${format}`);
  }
}

/**
 * Per-format validation of `formatConfig`. Each format declares its own
 * shape; this helper dispatches by slug and rejects malformed values at the
 * API boundary so the DB never holds a config the runtime can't honor.
 *
 * Custom-Region accepts `null` (no regions picked yet) or
 * `{ tagSlugs: <slug>[] }` where each slug references an existing
 * custom_tags row with category='region'. At least one slug is required;
 * duplicates are deduped to keep the persisted payload tidy.
 */
export async function validateFormatConfig(
  customTagsRepo: Repos["customTags"],
  format: string,
  config: Record<string, unknown> | null | undefined,
): Promise<DeckFormatConfig | null> {
  if (config === undefined || config === null) {
    return null;
  }

  if (format === WellKnown.deckFormat.CUSTOM_REGION) {
    const raw = config.tagSlugs;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "formatConfig.tagSlugs must be a non-empty array for Custom - Region decks",
      );
    }
    const slugs = [
      ...new Set(raw.filter((slug): slug is string => typeof slug === "string" && slug !== "")),
    ];
    if (slugs.length !== raw.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "formatConfig.tagSlugs must contain unique non-empty strings",
      );
    }
    const tags = await customTagsRepo.listBySlugs(slugs);
    const tagBySlug = new Map(tags.map((tag) => [tag.slug, tag]));
    for (const slug of slugs) {
      const tag = tagBySlug.get(slug);
      if (!tag) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown custom tag slug: ${slug}`);
      }
      if (tag.category !== "region") {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          `Custom tag "${slug}" is not in the region category`,
        );
      }
    }
    return { tagSlugs: slugs };
  }

  // Other formats don't accept config today; reject anything non-null so we
  // don't silently persist data that has no consumer.
  throw new AppError(
    400,
    ERROR_CODES.BAD_REQUEST,
    `Format "${format}" does not accept format_config`,
  );
}
