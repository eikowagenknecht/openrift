import type { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import type { ingestRepo } from "../repositories/ingest.js";
import {
  loadCandidateLinkIndex,
  resolveCardIdByName,
  resolvePrintingLink,
} from "./candidate-links.js";

type IngestRepo = ReturnType<typeof ingestRepo>;
type CandidateMutationsRepo = ReturnType<typeof candidateMutationsRepo>;

/**
 * Re-run the ingest-time key resolution for every unlinked candidate printing.
 *
 * Ingest only links candidates at upload time, so a printing accepted after a
 * provider's last upload leaves that provider's matching candidates unlinked
 * until the next re-upload. This pass closes the gap: it runs the shared
 * `resolvePrintingLink` (see candidate-links.ts) over every unlinked row and
 * bulk-links whatever now matches, so it can never fall behind what ingest
 * itself would have resolved.
 *
 * @returns How many unlinked rows were examined and how many got linked.
 */
export async function relinkCandidatePrintings(repos: {
  ingest: IngestRepo;
  candidateMutations: CandidateMutationsRepo;
}): Promise<{ examined: number; linked: number }> {
  const [unlinked, linkIndex] = await Promise.all([
    repos.ingest.allUnlinkedCandidatePrintings(),
    loadCandidateLinkIndex(repos.ingest),
  ]);

  // Collect target printing → candidate printing ids, then bulk-update per target.
  const idsByPrinting = new Map<string, string[]>();
  for (const cp of unlinked) {
    const resolvedId = resolvePrintingLink(linkIndex, {
      externalId: cp.externalId,
      shortCode: cp.shortCode,
      finish: cp.finish,
      markerSlugs: cp.markerSlugs,
      language: cp.language,
      cardLinked: resolveCardIdByName(linkIndex, cp.cardName) !== null,
    });

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
