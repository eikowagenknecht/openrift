import type { Repos } from "../deps.js";
import { UVSGAMES_PROVIDER } from "../lib/uvsgames-catalog.js";
import { promoteMetaEvent } from "./meta-promote.js";
import { errorText } from "./meta-sync/deps.js";

/**
 * Re-runs promotion over the events a rule change affects.
 *
 * Under the derive-live model there is nothing to infer about what a human
 * touched: an overridden field is one an accepted overlay claims, promotion
 * applies those last, and re-running it is the whole repair. The unscoped pass
 * covers every event, mirrors or not, because overlays apply to hand-entered
 * events through the same promote.
 */

export interface MetaRepromoteResult {
  /** Events promotion ran over. */
  events: number;
  /** Events that reported a problem, e.g. a format the archive cannot map. */
  failed: number;
  errors: string[];
}

/**
 * @param templateId Limits the pass to events running one uvsgames template,
 *   which is what editing that template's tier mapping affects. Omitted, every
 *   event is promoted again.
 */
export async function repromoteMetaEvents(
  repos: Repos,
  options?: { templateId?: string },
): Promise<MetaRepromoteResult> {
  const result: MetaRepromoteResult = { events: 0, failed: 0, errors: [] };
  const eventIds = await targetEventIds(repos, options?.templateId);

  for (const eventId of eventIds) {
    // One event's hard failure must not strand the rest of the batch
    // unpromoted with nothing recorded.
    try {
      const promoted = await promoteMetaEvent(repos, eventId);
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

async function targetEventIds(repos: Repos, templateId?: string): Promise<string[]> {
  if (templateId === undefined) {
    const events = await repos.meta.allEvents();
    return events.map((event) => event.id);
  }
  // Only the official source carries templates, so the scoped pass reads its
  // mirror for the keys and resolves them through the citation table.
  const externalIds = await repos.uvsgamesEvents.externalIdsForTemplate(templateId);
  const sources = await repos.meta.sourcesByKeys(UVSGAMES_PROVIDER, externalIds);
  return [...new Set(sources.map((source) => source.metaEventId))];
}
