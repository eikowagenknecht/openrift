import { extractBracketedTerms } from "@openrift/shared";

import type { keywordsRepo } from "../repositories/keywords.js";

interface DiscoveryResult {
  /** Number of card-language pairs examined. */
  candidatesExamined: number;
  /** Translation pairs discovered with sufficient confidence. */
  discovered: { keyword: string; language: string; label: string }[];
  /** New translations inserted (excludes already-existing rows). */
  inserted: number;
  /** Pairs with conflicting mappings that need manual review. */
  conflicts: { keyword: string; language: string; labels: string[] }[];
}

/**
 * Discovers keyword translations by positionally correlating bracketed terms
 * between English and non-English printings of the same card.
 *
 * For each card that has both EN and other-language printings, extracts
 * bracketed terms from both and zips them by position. Aggregates across
 * all cards and keeps pairs that appear consistently (2+ cards). Conflicts
 * (same EN keyword mapping to multiple labels in the same language) are
 * reported for manual review.
 *
 * @returns Discovery results including inserted count and any conflicts.
 */
export async function discoverKeywordTranslations(repos: {
  keywords: ReturnType<typeof keywordsRepo>;
}): Promise<DiscoveryResult> {
  const [candidates, existingKeywords] = await Promise.all([
    repos.keywords.getTranslationCandidates(),
    repos.keywords.listAll(),
  ]);

  const knownKeywords = new Set(existingKeywords.map((k) => k.name));

  // Aggregate: (enKeyword, language) → Map<translatedLabel, count>
  const pairCounts = new Map<string, Map<string, number>>();

  for (const candidate of candidates) {
    const enTerms = [
      ...extractBracketedTerms(candidate.enRulesText ?? ""),
      ...extractBracketedTerms(candidate.enEffectText ?? ""),
    ];
    const otherTerms = [
      ...extractBracketedTerms(candidate.otherRulesText ?? ""),
      ...extractBracketedTerms(candidate.otherEffectText ?? ""),
    ];

    // Only correlate if both printings have the same number of bracketed terms
    if (enTerms.length === 0 || enTerms.length !== otherTerms.length) {
      continue;
    }

    for (let i = 0; i < enTerms.length; i++) {
      const enKeyword = enTerms[i];
      const otherLabel = otherTerms[i];

      // Only map keywords we have styles for
      if (!knownKeywords.has(enKeyword)) {
        continue;
      }

      // Skip if the translated term is the same as English (no translation needed)
      if (enKeyword === otherLabel) {
        continue;
      }

      const key = `${enKeyword}\0${candidate.otherLanguage}`;
      let labelCounts = pairCounts.get(key);
      if (!labelCounts) {
        labelCounts = new Map();
        pairCounts.set(key, labelCounts);
      }
      labelCounts.set(otherLabel, (labelCounts.get(otherLabel) ?? 0) + 1);
    }
  }

  // Extract confident translations (seen on 2+ cards) and flag conflicts
  const discovered: DiscoveryResult["discovered"] = [];
  const conflicts: DiscoveryResult["conflicts"] = [];

  for (const [key, labelCounts] of pairCounts) {
    const [keyword, language] = key.split("\0");

    // Find labels with 2+ occurrences
    const confidentLabels = [...labelCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    if (confidentLabels.length === 0) {
      continue;
    }

    if (confidentLabels.length > 1) {
      conflicts.push({
        keyword,
        language,
        labels: confidentLabels.map(([label]) => label),
      });
      continue;
    }

    discovered.push({ keyword, language, label: confidentLabels[0][0] });
  }

  const inserted = await repos.keywords.bulkInsertTranslations(
    discovered.map((d) => ({
      keywordName: d.keyword,
      language: d.language,
      label: d.label,
    })),
  );

  return {
    candidatesExamined: candidates.length,
    discovered,
    inserted,
    conflicts,
  };
}
