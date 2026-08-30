import type { Repos, Transact } from "../deps.js";
import { classifyMetaEventTier, countryFromAddress } from "../lib/meta-event-classify.js";
import type {
  MetaCandidateClassification,
  MetaClassificationRow,
} from "../repositories/meta-candidates.js";
import type { MetaEventClassificationPatch } from "../repositories/meta.js";

/**
 * Re-runs the tier, country and location rules over every uvsgames candidate
 * and pushes the results onto the live events they feed. This is the admin's
 * "Reapply rules" action: a rule change in `lib/meta-event-classify.ts` reaches
 * rows classified under the old rules by running it again, and it doubles as
 * the backfill for rows staged before migration 266 added the columns.
 *
 * A human's edit survives. There is no manual-override flag; instead a live
 * value is only overwritten when it still equals what the pipeline last
 * claimed — the candidate's stored value, or the column's starting state
 * (`store` / null) for a candidate that never claimed anything. A live value
 * that matches neither was set by hand and is counted rather than touched.
 *
 * Unlinked live events (hand-entered, or fed only by another provider) are
 * never touched: with no uvsgames candidate there are no source facts to
 * recompute from, and their values are curation by definition.
 */

export interface MetaReclassifyResult {
  candidates: number;
  liveEvents: number;
  /** Live events holding at least one value a human changed. */
  keptManual: number;
}

const LIVE_FIELD_START: Record<"tier" | "country" | "location", string | null> = {
  tier: "store",
  country: null,
  location: null,
};

/**
 * How many events one pass carries at a time. The mirror runs to six figures,
 * so the rows are read a page at a time and written in batches rather than one
 * statement per event, and flushed per chunk rather than held to the end.
 */
const CHUNK = 500;

/**
 * @param options.transact Opens one transaction per chunk. Without it the
 * candidate write and the live write are separate, and a crash between them
 * leaves a live value matching neither the old claim nor the new one, which
 * every later pass then reads as a human's edit and stops maintaining.
 */
export async function reclassifyMetaEvents(
  repos: Repos,
  options?: { templateId?: string; transact?: Transact },
): Promise<MetaReclassifyResult> {
  const result: MetaReclassifyResult = { candidates: 0, liveEvents: 0, keptManual: 0 };

  let candidatePatches: MetaCandidateClassification[] = [];
  let livePatches: MetaEventClassificationPatch[] = [];

  const flush = async (): Promise<void> => {
    if (candidatePatches.length === 0 && livePatches.length === 0) {
      return;
    }
    const candidates = candidatePatches;
    const live = livePatches;
    candidatePatches = [];
    livePatches = [];
    const write = async (scoped: Repos): Promise<void> => {
      await scoped.metaCandidates.setClassifications(candidates);
      await scoped.meta.setEventClassifications(live);
    };
    await (options?.transact === undefined ? write(repos) : options.transact(write));
    result.candidates += candidates.length;
    result.liveEvents += live.length;
  };

  const classify = async (row: MetaClassificationRow): Promise<void> => {
    const location =
      row.sourceLocation === null ? null : row.sourceLocation.trim().slice(0, 500) || null;
    const computed = {
      tier: classifyMetaEventTier({
        templateTier: row.templateTier,
        playerCount: row.playerCount,
      }),
      country: countryFromAddress(location),
      location,
    };

    const candidateChanged =
      computed.tier !== row.tier ||
      computed.country !== row.country ||
      computed.location !== row.location;
    if (candidateChanged) {
      candidatePatches.push({ id: row.candidateEventId, ...computed });
    }

    if (row.metaEventId !== null) {
      const live = { tier: row.liveTier, country: row.liveCountry, location: row.liveLocation };
      const follows = { tier: false, country: false, location: false };
      let manual = false;
      for (const field of ["tier", "country", "location"] as const) {
        const pipelineClaim = row[field] ?? LIVE_FIELD_START[field];
        if (live[field] !== pipelineClaim) {
          if (live[field] !== computed[field]) {
            manual = true;
          }
        } else if (computed[field] !== live[field]) {
          follows[field] = true;
        }
      }
      if (manual) {
        result.keptManual++;
      }
      if (follows.tier || follows.country || follows.location) {
        livePatches.push({
          id: row.metaEventId,
          ...(follows.tier ? { tier: computed.tier } : {}),
          ...(follows.country ? { country: computed.country } : {}),
          ...(follows.location ? { location: computed.location } : {}),
        });
      }
    }

    if (candidatePatches.length >= CHUNK || livePatches.length >= CHUNK) {
      await flush();
    }
  };

  let page = await repos.metaCandidates.classificationRows({
    templateId: options?.templateId,
    limit: CHUNK,
  });
  while (page.length > 0) {
    for (const row of page) {
      await classify(row);
    }
    const last = page.at(-1);
    if (page.length < CHUNK || last === undefined) {
      break;
    }
    page = await repos.metaCandidates.classificationRows({
      templateId: options?.templateId,
      afterId: last.candidateEventId,
      limit: CHUNK,
    });
  }

  await flush();
  return result;
}
