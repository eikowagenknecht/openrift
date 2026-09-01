import type { PlayloltcgCatalogRow } from "@openrift/shared/contracts/admin/meta-catalog";

import type { PlayloltcgListRow } from "../repositories/playloltcg-events.js";
import { playloltcgEventUrl } from "./playloltcg-catalog.js";

/**
 * One playloltcg catalogue row as the admin triage table reads it. The store's
 * current name wins over the row's own fallback (via `shopDisplayName`), and the
 * venue city stands in for uvsgames' location line.
 */
export function toPlayloltcgCatalogRow(row: PlayloltcgListRow): PlayloltcgCatalogRow {
  return {
    activityShopId: row.activityShopId,
    name: row.name,
    shopName: row.shopDisplayName,
    city: row.city,
    status: row.status,
    battleMode: row.battleMode,
    playerCount: row.playerCount,
    startAt: row.startAt,
    triage: row.triage,
    metaEventId: row.metaEventId,
    metaEventSlug: row.metaEventSlug,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
    missingSince: row.missingSince?.toISOString() ?? null,
    nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
    stagedPlayerCount: row.stagedPlayerCount,
    stagedLegendCount: row.stagedLegendCount,
    stagedDeckCount: row.stagedDeckCount,
    sourceUrl: playloltcgEventUrl(row.activityShopId),
  };
}
