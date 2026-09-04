import type { Repos } from "../deps.js";
import { createMetaPromoteContext, promoteMetaEvent } from "./meta-promote.js";
import { errorText } from "./meta-sync/deps.js";

/**
 * Re-runs promotion over every event in the archive: the general repair,
 * deliberately unconditional and slow. Accepted overlays still win whatever
 * they claim. The everyday case, a tier mapping that moved, is
 * {@link retierMetaEvents}.
 */

export interface MetaRepromoteResult {
  /** Events promotion ran over. */
  events: number;
  /** Events that reported a problem, e.g. a format the archive cannot map. */
  failed: number;
  errors: string[];
}

export async function repromoteMetaEvents(repos: Repos): Promise<MetaRepromoteResult> {
  const events = await repos.meta.allEventTiers();
  return await promoteEach(
    repos,
    events.map((event) => event.id),
  );
}

/**
 * Promotes a list of events, sharing one rule context across the whole pass.
 *
 * @returns How many events ran and what any of them reported.
 */
export async function promoteEach(
  repos: Repos,
  eventIds: readonly string[],
): Promise<MetaRepromoteResult> {
  const result: MetaRepromoteResult = { events: 0, failed: 0, errors: [] };
  if (eventIds.length === 0) {
    return result;
  }
  const context = await createMetaPromoteContext(repos);

  for (const eventId of eventIds) {
    // One event's hard failure must not strand the rest of the batch
    // unpromoted with nothing recorded.
    try {
      const promoted = await promoteMetaEvent(repos, eventId, context);
      result.events++;
      if (promoted.errors.length > 0) {
        result.failed++;
        result.errors.push(...promoted.errors);
      }
    } catch (error) {
      result.events++;
      result.failed++;
      result.errors.push(errorText(error, `Event ${eventId}`));
    }
  }
  return result;
}

export function isRepromoteNoop(result: MetaRepromoteResult): boolean {
  return result.events === 0;
}
