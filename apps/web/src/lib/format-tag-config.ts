import type { DeckFormatConfig } from "@openrift/shared/types/api/deck";
import type { CustomTag } from "@openrift/shared/types/catalog";
import { WellKnown } from "@openrift/shared/well-known";

/** A tag-locked format stores `tagSlugs` in `decks.format_config`, keyed by format slug. */
export interface FormatTagConfig {
  category: string;
  noun: string;
  nounPlural: string;
}

const FORMAT_TAG_CONFIGS: Record<string, FormatTagConfig> = {
  [WellKnown.deckFormat.CUSTOM_REGION]: {
    category: "region",
    noun: "region",
    nounPlural: "regions",
  },
};

export function getFormatTagConfig(format: string): FormatTagConfig | null {
  return FORMAT_TAG_CONFIGS[format] ?? null;
}

/** Tags that no longer resolve (admin-deleted slugs) are silently dropped; validation surfaces that separately. */
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
