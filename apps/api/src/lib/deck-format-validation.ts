import { ERROR_CODES, WellKnown } from "@openrift/shared";
import type { DeckFormatConfig } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";

/** Rejects a format not in `deck_formats`, before the FK turns it into a raw constraint violation. */
export async function assertKnownFormat(
  deckFormats: Repos["deckFormats"],
  format: string,
): Promise<void> {
  const row = await deckFormats.getBySlug(format);
  if (!row) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown deck format: ${format}`);
  }
}

/** Validates `formatConfig` against the shape the given format's slug declares. */
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

  throw new AppError(
    400,
    ERROR_CODES.BAD_REQUEST,
    `Format "${format}" does not accept format_config`,
  );
}
