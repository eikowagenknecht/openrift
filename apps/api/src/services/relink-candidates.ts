import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type { ingestRepo } from "../repositories/ingest.js";
import {
  loadCandidateLinkIndex,
  resolveCardIdByName,
  resolvePrintingLink,
} from "./candidate-links.js";

type IngestRepo = ReturnType<typeof ingestRepo>;
type CandidateCardsRepo = ReturnType<typeof candidateCardsRepo>;

/**
 * Ingest only links candidates at upload time, so a printing accepted after a
 * provider's last upload leaves matching candidates unlinked until re-upload.
 */
export async function relinkCandidatePrintings(repos: {
  ingest: IngestRepo;
  candidateCards: CandidateCardsRepo;
}): Promise<{ examined: number; linked: number }> {
  const [unlinked, linkIndex] = await Promise.all([
    repos.ingest.allUnlinkedCandidatePrintings(),
    loadCandidateLinkIndex(repos.ingest),
  ]);

  const idsByPrinting = new Map<string, string[]>();
  for (const cp of unlinked) {
    const resolvedId = resolvePrintingLink(linkIndex, {
      provider: cp.provider,
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
    await repos.candidateCards.linkCandidatePrintings(ids, printingId);
    linked += ids.length;
  }

  return { examined: unlinked.length, linked };
}
