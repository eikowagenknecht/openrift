import { projectTemplateRows } from "../../lib/uvsgames-catalog.js";
import type { MetaSyncDeps } from "./deps.js";
import { errorText, GAME_SLUG, TEMPLATES_PATH } from "./deps.js";

export interface MetaTemplateSyncResult {
  named: number;
  retired: number;
  errors: string[];
}

export async function syncEventTemplates(deps: MetaSyncDeps): Promise<MetaTemplateSyncResult> {
  const result: MetaTemplateSyncResult = { named: 0, retired: 0, errors: [] };

  try {
    // Omitting game_slug is a 400; only the lowercase slug is accepted.
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
