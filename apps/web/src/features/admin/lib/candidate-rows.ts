import type { ProviderSettingResponse } from "@openrift/shared/types/api/admin";

/** A candidate row read generically by field key; provider/candidateCardId are optional and fall back to a label derived from the row id. */
export interface CandidateSpreadsheetRow {
  id: string;
  checkedAt: string | null;
  provider?: string;
  candidateCardId?: string;
}

export function getProviderLabel(
  row: CandidateSpreadsheetRow,
  providerLabels?: Record<string, string>,
): string {
  if (row.provider !== undefined) {
    return row.provider;
  }
  const parentCardId = row.candidateCardId;
  const inherited = parentCardId === undefined ? undefined : providerLabels?.[parentCardId];
  return inherited ?? `provider-${row.id.slice(0, 8)}`;
}

export function isChecked(row: CandidateSpreadsheetRow): boolean {
  return row.checkedAt !== null;
}

export function isFavoriteProvider(
  row: CandidateSpreadsheetRow,
  providerLabels: Record<string, string> | undefined,
  favoriteProviders: Set<string>,
): boolean {
  return favoriteProviders.has(getProviderLabel(row, providerLabels));
}

export function favoriteProviderSet(providerSettings?: ProviderSettingResponse[]): Set<string> {
  return new Set(providerSettings?.filter((s) => s.isFavorite).map((s) => s.provider));
}

export function sortCandidateRows<TRow extends CandidateSpreadsheetRow>(
  rows: TRow[],
  providerLabels: Record<string, string> | undefined,
  providerSettings: ProviderSettingResponse[] | undefined,
): TRow[] {
  const settingsMap = new Map(providerSettings?.map((s) => [s.provider, s]));
  return rows.toSorted((a, b) => {
    const aLabel = getProviderLabel(a, providerLabels);
    const bLabel = getProviderLabel(b, providerLabels);
    const aOrder = settingsMap.get(aLabel)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(bLabel)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return aLabel.localeCompare(bLabel);
  });
}
