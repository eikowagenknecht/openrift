import { extractBracketedTerms } from "@openrift/shared";

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

    if (enTerms.length === 0 || enTerms.length !== otherTerms.length) {
      continue;
    }

    for (let i = 0; i < enTerms.length; i++) {
      const enKeyword = enTerms[i];
      const otherLabel = otherTerms[i];

      if (!knownKeywords.has(enKeyword)) {
        continue;
      }

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

  const discovered: DiscoveryResult["discovered"] = [];
  const conflicts: DiscoveryResult["conflicts"] = [];

  for (const [key, labelCounts] of pairCounts) {
    const [keyword, language] = key.split("\0");

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
