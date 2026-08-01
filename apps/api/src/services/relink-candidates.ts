import { WellKnown } from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared/utils";

import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { ingestRepo } from "../repositories/ingest.js";

type IngestRepo = ReturnType<typeof ingestRepo>;
type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;

/**
 * Re-run the ingest-time key resolution for every unlinked candidate printing.
 *
 * Ingest only links candidates at upload time, so a printing accepted after a
 * provider's last upload leaves that provider's matching candidates unlinked
 * until the next re-upload. This pass closes the gap: it applies the exact
 * same resolution as `ingestCandidates` (manual link overrides first, then the
 * uppercased `shortCode:finish:markers:language` composite key, gated on the
 * card resolving by normalized name) and bulk-links whatever now matches.
 *
 * @returns How many unlinked rows were examined and how many got linked.
 */
export async function relinkCandidatePrintings(repos: {
  ingest: IngestRepo;
  candidateMutations: CandidateMutationsRepo;
}): Promise<{ examined: number; linked: number }> {
  const [unlinked, allCards, allAliases, allPrintings, overrideRows] = await Promise.all([
    repos.ingest.allUnlinkedCandidatePrintings(),
    repos.ingest.allCardNorms(),
    repos.ingest.allCardNameAliases(),
    repos.ingest.allPrintingKeys(),
    repos.ingest.allPrintingLinkOverrides(),
  ]);

  const cardByNorm = new Set(allCards.map((c) => c.normName));
  const aliasByNorm = new Set(allAliases.map((a) => a.normName));

  const printingByKey = new Map<string, string>();
  for (const p of allPrintings) {
    const slugKey = [...p.markerSlugs].sort().join(",");
    printingByKey.set(`${p.shortCode.toUpperCase()}:${p.finish}:${slugKey}:${p.language}`, p.id);
  }

  const linkOverrides = new Map<string, string>();
  for (const r of overrideRows) {
    linkOverrides.set(`${r.externalId}:${r.finish}`, r.printingId);
  }

  // Collect target printing → candidate printing ids, then bulk-update per target.
  const idsByPrinting = new Map<string, string[]>();
  for (const cp of unlinked) {
    const overrideId = linkOverrides.get(`${cp.externalId}:${cp.finish ?? ""}`);
    let resolvedId = overrideId ?? null;

    if (!resolvedId && cp.finish) {
      // Same gate as ingest: only link candidates whose card resolves by
      // normalized name (an empty norm identifies nothing).
      const normName = normalizeNameForMatching(cp.cardName);
      const cardExists = normName !== "" && (cardByNorm.has(normName) || aliasByNorm.has(normName));
      if (cardExists) {
        const slugKey = [...cp.markerSlugs].sort().join(",");
        const key = `${cp.shortCode.toUpperCase()}:${cp.finish}:${slugKey}:${cp.language ?? WellKnown.language.EN}`;
        resolvedId = printingByKey.get(key) ?? null;
      }
    }

    if (resolvedId) {
      const ids = idsByPrinting.get(resolvedId);
      if (ids) {
        ids.push(cp.id);
      } else {
        idsByPrinting.set(resolvedId, [cp.id]);
      }
    }
  }

  let linked = 0;
  for (const [printingId, ids] of idsByPrinting) {
    await repos.candidateMutations.linkCandidatePrintings(ids, printingId);
    linked += ids.length;
  }

  return { examined: unlinked.length, linked };
}
