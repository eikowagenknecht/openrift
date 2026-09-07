import { extractBracketedTerms } from "@openrift/shared/keywords";

import type { keywordsRepo } from "../repositories/keywords.js";

interface DiscoveryResult {
  candidatesExamined: number;
  discovered: { keyword: string; language: string; label: string }[];
  inserted: number;
  conflicts: { keyword: string; language: string; labels: string[] }[];
}

/**
 * Correlates bracketed terms positionally between a card's EN and other-language
 * printings; keeps pairs agreeing across 2+ cards, flags the rest as conflicts.
 */
export async function discoverKeywordTranslations(repos: {
  keywords: ReturnType<typeof keywordsRepo>;
}): Promise<DiscoveryResult> {
  const [candidates, existingKeywords] = await Promise.all([
    repos.keywords.getTranslationCandidates(),
    repos.keywords.listAll(),
  ]);

  const knownKeywords = new Set(existingKeywords.map((k) => k.name));

  const pairCounts = new Map<
    string,
    { keyword: string; language: string; labelCounts: Map<string, number> }
  >();

  for (const candidate of candidates) {
    const enTerms = [
      ...extractBracketedTerms(candidate.enRulesText ?? ""),
      ...extractBracketedTerms(candidate.enEffectText ?? ""),
    ];
    const otherTerms = [
      ...extractBracketedTerms(candidate.otherRulesText ?? ""),
      ...extractBracketedTerms(candidate.otherEffectText ?? ""),
    ];

    if (enTerms.length === 0 || enTerms.length !== otherTerms.length) {
      continue;
    }

    for (const [i, enKeyword] of enTerms.entries()) {
      const otherLabel = otherTerms[i];

      if (otherLabel === undefined || !knownKeywords.has(enKeyword)) {
        continue;
      }

      if (enKeyword === otherLabel) {
        continue;
      }

      const key = `${enKeyword}\0${candidate.otherLanguage}`;
      let pair = pairCounts.get(key);
      if (!pair) {
        pair = {
          keyword: enKeyword,
          language: candidate.otherLanguage,
          labelCounts: new Map(),
        };
        pairCounts.set(key, pair);
      }
      pair.labelCounts.set(otherLabel, (pair.labelCounts.get(otherLabel) ?? 0) + 1);
    }
  }

  const discovered: DiscoveryResult["discovered"] = [];
  const conflicts: DiscoveryResult["conflicts"] = [];

  for (const { keyword, language, labelCounts } of pairCounts.values()) {
    const confidentLabels = [...labelCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    const [topLabel] = confidentLabels;
    if (!topLabel) {
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

    discovered.push({ keyword, language, label: topLabel[0] });
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
