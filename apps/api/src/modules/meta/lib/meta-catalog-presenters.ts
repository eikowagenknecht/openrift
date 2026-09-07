import type {
  MetaCatalogRow as MetaCatalogRowResponse,
  MetaSourceTemplate,
} from "@openrift/shared/contracts/admin/meta-catalog";

import type { UvsgamesCoverageRow, UvsgamesTemplateRow } from "../repositories/uvsgames-events.js";
import { suggestTierForTemplateName } from "./meta-event-classify.js";
import { mapSourceFormat, uvsgamesEventUrl } from "./uvsgames-catalog.js";

/** `officialLabel` resolves the template uuid to its watched name; the uuid itself never reaches the client. */
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

/** `suggestedTier` is a name-rule guess, not stored, for prefilling an unmapped template. */
export function toMetaSourceTemplate(row: UvsgamesTemplateRow): MetaSourceTemplate {
  return {
    templateId: row.templateId,
    sourceName: row.sourceName,
    watched: row.watched,
    tier: row.tier,
    suggestedTier: suggestTierForTemplateName(row.sourceName),
    eventCount: row.eventCount,
    avgPlayers: row.avgPlayers,
    ranEventCount: row.ranEventCount,
    sampleEventName: row.sampleEventName,
    lastStartAt: row.lastStartAt?.toISOString() ?? null,
  };
}
