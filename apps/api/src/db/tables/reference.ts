import type { Generated } from "kysely";

export interface ReferenceTable {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: Generated<boolean>;
}

export type CardTypesTable = ReferenceTable;
export interface RaritiesTable extends ReferenceTable {
  color: string | null;
}
export interface DomainsTable extends ReferenceTable {
  color: string | null;
}
export type SuperTypesTable = ReferenceTable;
export type FinishesTable = ReferenceTable;
export type ArtVariantsTable = ReferenceTable;
export type CardSizesTable = ReferenceTable;
export type DeckFormatsTable = ReferenceTable;
export type DeckZonesTable = ReferenceTable;
export type ConditionsTable = ReferenceTable;
export type GradersTable = ReferenceTable;
