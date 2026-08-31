import type {
  MetaCatalogRow as MetaCatalogRowResponse,
  MetaSourceTemplate,
} from "@openrift/shared/contracts/admin/meta-catalog";

import type { UvsgamesCoverageRow, UvsgamesTemplateRow } from "../repositories/uvsgames-events.js";
import { suggestTierForTemplateName } from "./meta-event-classify.js";
import { mapSourceFormat, uvsgamesEventUrl } from "./uvsgames-catalog.js";

/**
 * The catalogue mirror as the admin triage list reads it. Three fields are
 * derived rather than stored: the format mapping, so the list can grey out an
 * event that cannot be accepted without a manual pick; the source URL, which is
 * a function of the key; and the official label, which is the watched
 * template's name as the source publishes it — the uuid itself stays
 * server-side, since it means nothing to a reader.
 *
 * Both curated vocabularies arrive as maps the caller loaded once for the whole
 * page, rather than being looked up per row.
 */
export function toMetaCatalogRow(
  row: UvsgamesCoverageRow,
  vocabulary: {
    formatMappings: ReadonlyMap<string, string>;
    watchedTemplates: ReadonlyMap<string, string | null>;
  },
): MetaCatalogRowResponse {
  return {
    externalId: row.externalId,
    name: row.name,
    startAt: row.startAt.toISOString(),
    endAtEstimate: row.endAtEstimate?.toISOString() ?? null,
    displayStatus: row.displayStatus,
    decklistStatus: row.decklistStatus,
    playerCount: row.playerCount,
    eventType: row.eventType,
    eventFormat: row.eventFormat,
    mappedFormat: mapSourceFormat(vocabulary.formatMappings, row.eventFormat),
    officialLabel:
      row.eventConfigurationTemplate === null
        ? null
        : (vocabulary.watchedTemplates.get(row.eventConfigurationTemplate) ?? null),
    storeName: row.storeDisplayName,
    location: row.location,
    timezone: row.timezone,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    missingSince: row.missingSince?.toISOString() ?? null,
    nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
    checkStage: row.checkStage,
    triage: row.triage,
    metaEventId: row.metaEventId,
    metaEventSlug: row.metaEventSlug,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
    stagedPlayerCount: row.stagedPlayerCount,
    stagedLegendCount: row.stagedLegendCount,
    stagedDeckCount: row.stagedDeckCount,
    sourceUrl: uvsgamesEventUrl(row.externalId),
  };
}

/**
 * One template row as the admin vocabulary screen reads it. `suggestedTier` is
 * derived rather than stored: it is what the name rules would guess, offered as
 * a prefill for a template nobody has mapped yet.
 */
export function toMetaSourceTemplate(row: UvsgamesTemplateRow): MetaSourceTemplate {
  return {
    templateId: row.templateId,
    sourceName: row.sourceName,
    watched: row.watched,
    tier: row.tier,
    suggestedTier: suggestTierForTemplateName(row.sourceName),
    eventCount: row.eventCount,
    sampleEventName: row.sampleEventName,
    lastStartAt: row.lastStartAt?.toISOString() ?? null,
  };
}
