import type { RuleChangeType, RuleKind, RuleType } from "@openrift/shared/types/api/rules";
import type {
  ArtVariant,
  CardFace,
  CardSize,
  CardType,
  FallbackArtMode,
  Finish,
  Rarity,
} from "@openrift/shared/types/enums";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface SetsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  printedTotal: number | null;
  sortOrder: Generated<number>;
  setType: Generated<"main" | "supplemental">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

type ReleasePrecision = "day" | "month" | "quarter" | "year";

export interface SetReleasesTable {
  setId: string;
  language: string;
  releasedAt: string | null;
  precision: ReleasePrecision | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  normName: Generated<string>;
  type: CardType;
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  keywords: Generated<string[]>;
  tags: Generated<string[]>;
  maxCopiesOverride: number | null;
  comment: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardErrataTable {
  id: Generated<string>;
  cardId: string;
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string | null;
  /** `date` column: the driver returns it as `"YYYY-MM-DD"` text, not a `Date` (OID 1082 override in `db/connect.ts`). */
  effectiveDate: ColumnType<string | null, string | Date | null | undefined, string | Date | null>;
  createdAt: CreatedAt;
}

export interface PrintingsTable {
  id: Generated<string>;
  cardId: string;
  setId: string;
  slug: Generated<string>;
  shortCode: string;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: Generated<boolean>;
  isOvernumbered: Generated<boolean>;
  markerSlugs: Generated<string[]>;
  finish: Finish;
  size: Generated<CardSize>;
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  comment: string | null;
  language: Generated<string>;
  printedName: string | null;
  printedYear: number | null;
  fallbackArtMode: Generated<FallbackArtMode>;
  fallbackImageFileId: string | null;
  announcedAt: string | null;
  releasedAt: string | null;
  releasePrecision: ReleasePrecision | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// Must stay exported — TypeScript names it in inferred Kysely query return
// types (e.g. selectCopyWithCard in repositories/query-helpers.ts).
// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface ImageFilesTable {
  id: Generated<string>;
  originalUrl: string | null;
  rehostedUrl: string | null;
  rotation: Generated<0 | 90 | 180 | 270>;
  needsTrim: Generated<boolean>;
  credit: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingImagesTable {
  id: Generated<string>;
  printingId: string;
  face: Generated<CardFace>;
  imageFileId: string;
  isActive: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardNameAliasesTable {
  normName: string;
  cardId: string;
}

export interface LanguagesTable {
  code: string;
  name: string;
  color: string | null;
  sortOrder: Generated<number>;
  isWellKnown: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarkersTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingMarkersTable {
  printingId: string;
  markerId: string;
}

export interface CustomTagCategoriesTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CustomTagsTable {
  id: Generated<string>;
  slug: string;
  label: string;
  categoryId: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardCustomTagsTable {
  cardId: string;
  customTagId: string;
}

export interface TagCategoriesTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface TagDefinitionsTable {
  id: Generated<string>;
  tag: string;
  categoryId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DistributionChannelsTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  kind: Generated<"event" | "product">;
  sortOrder: Generated<number>;
  parentId: string | null;
  childrenLabel: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingDistributionChannelsTable {
  printingId: string;
  channelId: string;
  distributionNote: string | null;
}

export interface PrintingCitationsTable {
  id: Generated<string>;
  printingId: string;
  label: string;
  sourceUrl: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
}

export interface KeywordsTable {
  name: string;
  color: string;
  darkText: Generated<boolean>;
  isWellKnown: Generated<boolean>;
  costKeyword: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface KeywordTranslationsTable {
  keywordName: string;
  language: string;
  label: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FormatsTable {
  id: string;
  name: string;
  createdAt: CreatedAt;
}

export interface CardBansTable {
  id: Generated<string>;
  cardId: string;
  formatId: string;
  bannedAt: string;
  unbannedAt: string | null;
  reason: string | null;
  createdAt: CreatedAt;
}

export interface RuleVersionsTable {
  kind: RuleKind;
  version: string;
  comments: string | null;
  importedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface RulesTable {
  id: Generated<string>;
  kind: RuleKind;
  version: string;
  ruleNumber: string;
  sortOrder: number;
  depth: number;
  ruleType: RuleType;
  content: string;
  changeType: Generated<RuleChangeType>;
  createdAt: CreatedAt;
}

export interface PrintingEventsTable {
  id: Generated<string>;
  printingId: string;
  status: Generated<"pending" | "sent" | "failed">;
  retryCount: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardDomainsTable {
  cardId: string;
  domainSlug: string;
  ordinal: number;
}

export interface CardSuperTypesTable {
  cardId: string;
  superTypeSlug: string;
}

export interface CardCardTypesTable {
  cardId: string;
  typeSlug: string;
  position: number;
}

/**
 * Exported as a value so the enum-CHECK parity test can compare it against
 * `chk_card_tokens_source`.
 */
export const CARD_TOKEN_SOURCES = ["derived", "manual"] as const;

export interface CardTokensTable {
  cardId: string;
  tokenCardId: string;
  source: Generated<(typeof CARD_TOKEN_SOURCES)[number]>;
}
