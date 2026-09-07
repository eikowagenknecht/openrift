import type { MarketplaceGroupKind, StagedProductResponse } from "@openrift/shared/types/api/admin";

import type { MarketplaceConfig, ProductInfo, StagingRow } from "../lib/marketplace-configs.js";

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
  // Full SKU tuple: one externalId can be imported as multiple finishes bound
  // to the same printing, so dropping finish/language would overwrite one price with the other's.
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
