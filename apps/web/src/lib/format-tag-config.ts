import type { CustomTag, DeckFormatConfig } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

/**
 * Per-format metadata for tag-locked deck formats. A tag-locked format
 * stores `tagSlugs` in `decks.format_config` and constrains every card in
 * the deck to carry one of those tags.
 *
 * The mapping is keyed by format slug. To add a new tag-locked format,
 * append an entry and the generic banner + edit dialog pick it up
 * automatically — no other changes needed in the deck-builder UI.
 */
export interface FormatTagConfig {
  /** `custom_tags.category` whose slugs the user picks from for this format. */
  category: string;
  /** Singular display noun, e.g. "region". Lower-case; the UI title-cases as needed. */
  noun: string;
  /** Plural display noun, e.g. "regions". */
  nounPlural: string;
}

const FORMAT_TAG_CONFIGS: Record<string, FormatTagConfig> = {
  [WellKnown.deckFormat.CUSTOM_REGION]: {
    category: "region",
    noun: "region",
    nounPlural: "regions",
  },
};

/**
 * @returns The tag-locked configuration for a format, or null when the
 *   format isn't tag-locked (constructed, freeform, …).
 */
export function getFormatTagConfig(format: string): FormatTagConfig | null {
  return FORMAT_TAG_CONFIGS[format] ?? null;
}

/**
 * Builds the display string for a deck's tag-locked format selection. Picked
 * tags that no longer resolve (admin-deleted slugs) are silently dropped —
 * validation surfaces that breakage separately. Used by the deck-list row
 * and tile so they don't have to duplicate the join/resolve logic.
 *
 * @returns "<label> + <label>" when tags are picked, "No <nounPlural> picked"
 *   when nothing resolves, or null when the format isn't tag-locked.
 */
export function resolveFormatTagSummary(
  format: string,
  formatConfig: DeckFormatConfig | null,
  customTags: CustomTag[],
): string | null {
  const config = getFormatTagConfig(format);
  if (!config) {
    return null;
  }
  const tagSlugs = formatConfig?.tagSlugs ?? [];
  const labels = tagSlugs
    .map((slug) => customTags.find((tag) => tag.slug === slug)?.label)
    .filter((label): label is string => typeof label === "string");
  return labels.length === 0 ? `No ${config.nounPlural} picked` : labels.join(" + ");
}
