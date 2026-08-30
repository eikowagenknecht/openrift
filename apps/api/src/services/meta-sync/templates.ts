import { projectTemplateRows } from "../../lib/uvsgames-catalog.js";
import type { MetaSyncDeps } from "./deps.js";
import { errorText, GAME_SLUG, TEMPLATES_PATH } from "./deps.js";

/**
 * The source's event-template vocabulary, refreshed from the endpoint that
 * publishes it. One request for the whole list: it is a bare array of a couple
 * of dozen entries with no pagination, and the `game_slug` parameter is
 * required (omitting it is a 400, and only the lowercase slug is accepted).
 *
 * This is what keeps template ids out of the admin's hands. The listing row
 * carries the template as a raw uuid and nothing else, so before this endpoint
 * was used a watched template had to be named by hand; now the only thing left
 * for a human is deciding which templates are worth watching.
 */

export interface MetaTemplateSyncResult {
  /** Templates the endpoint published, all of which were stored with their name. */
  named: number;
  /** Ids the mirror carries that the endpoint no longer publishes, given bare rows. */
  retired: number;
  errors: string[];
}

/**
 * Names every template the source publishes, then gives a row to any template
 * id the mirror carries that the endpoint left out. The second half is what
 * keeps a retired template visible in the vocabulary list, since its events are
 * still in the archive.
 *
 * Neither half touches `watched`, and a failing endpoint costs the run its
 * template refresh rather than its crawl.
 *
 * @returns How many were named and how many retired ids got a bare row, plus
 * whatever went wrong.
 */
export async function syncEventTemplates(deps: MetaSyncDeps): Promise<MetaTemplateSyncResult> {
  const result: MetaTemplateSyncResult = { named: 0, retired: 0, errors: [] };

  try {
    const body = await deps.client.get<unknown>(TEMPLATES_PATH, { game_slug: GAME_SLUG });
    const templates = projectTemplateRows(body);
    await deps.repos.uvsgamesEvents.upsertTemplates(templates);
    result.named = templates.length;
  } catch (error) {
    result.errors.push(errorText(error, "Template vocabulary"));
  }

  try {
    result.retired = await deps.repos.uvsgamesEvents.discoverTemplatesFromEvents();
  } catch (error) {
    result.errors.push(errorText(error, "Template discovery"));
  }

  return result;
}
