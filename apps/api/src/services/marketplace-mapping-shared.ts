import type { MarketplaceGroupKind, StagedProductResponse } from "@openrift/shared";

import type {
  MarketplaceConfig,
  ProductInfo,
  StagingRow,
} from "../routes/admin/marketplace-configs.js";

/**
 * Fetch latest prices for already-bound printings and build the staged-row →
 * response mapper. Shared by `getMappingOverview` (marketplace-mapping.ts)
 * and the per-card overview builder (unified-mapping-merge.ts) — both need
 * the same price lookup and staged-row shaping per marketplace.
 * @returns The keyed price lookup plus a `mapStagedRow` closure over it.
 */
export async function buildStagedRowMapping(
  config: MarketplaceConfig,
  mappedPrintingIds: Set<string>,
  groupNameMap: Map<number, string>,
  groupKindMap: Map<number, MarketplaceGroupKind>,
  groupSetSlugMap: Map<number, string | null>,
): Promise<{
  mappedProductInfo: Map<string, ProductInfo>;
  mapStagedRow: (row: StagingRow, extra?: { isOverride?: boolean }) => StagedProductResponse;
}> {
  // Key by the full SKU tuple (printingId, externalId, finish, language). The
  // SKU key on `marketplace_products` is `(externalId, finish, language)` —
  // CM regularly imports one externalId as multiple finishes, and both can be
  // bound to the same printing, so dropping `finish`/`language` from the key
  // would silently let one finish's price overwrite the other.
  const mappedProductInfo = new Map<string, ProductInfo>();
  if (mappedPrintingIds.size > 0) {
    const mappedRows = await config.priceQuery([...mappedPrintingIds]);
    for (const row of mappedRows) {
      const key = `${row.printingId}::${row.externalId}::${row.finish}::${row.language ?? ""}`;
      if (!mappedProductInfo.has(key)) {
        mappedProductInfo.set(key, config.mapPriceRow(row));
      }
    }
  }

  const mapStagedRow = (
    row: StagingRow,
    extra?: { isOverride?: boolean },
  ): StagedProductResponse => ({
    externalId: row.externalId ?? "",
    productName: row.productName,
    finish: row.finish,
    language: row.language,
    ...config.mapStagingPrices(row),
    recordedAt: row.recordedAt.toISOString(),
    ...(extra?.isOverride === undefined ? {} : { isOverride: extra.isOverride }),
    groupId: row.groupId,
    groupName: groupNameMap.get(row.groupId) ?? `Group #${row.groupId}`,
    groupKind: groupKindMap.get(row.groupId),
    groupSetSlug: groupSetSlugMap.get(row.groupId) ?? null,
  });

  return { mappedProductInfo, mapStagedRow };
}
