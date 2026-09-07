import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface CandidateCardsTable {
  id: Generated<string>;
  provider: string;
  name: string;
  normName: Generated<string>;
  types: Generated<string[]>;
  superTypes: Generated<string[]>;
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  rulesText: string | null;
  effectText: string | null;
  tags: Generated<string[]>;
  shortCode: string | null;
  externalId: string;
  extraData: unknown | null;
  submittedByUserId: string | null;
  submissionNote: string | null;
  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CandidatePrintingsTable {
  id: Generated<string>;
  candidateCardId: string;
  printingId: string | null;
  shortCode: string;
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  artVariant: string | null;
  isSigned: boolean | null;
  isOvernumbered: boolean | null;
  markerSlugs: Generated<string[]>;
  distributionChannelSlugs: Generated<string[]>;
  finish: string | null;
  size: string | null;
  artist: string | null;
  publicCode: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  imageUrl: string | null;
  flavorText: string | null;
  externalId: string;
  extraData: unknown | null;

  language: string | null;
  printedName: string | null;
  printedYear: number | null;

  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface IgnoredCandidateCardsTable {
  id: Generated<string>;
  provider: string;
  externalId: string;
  createdAt: CreatedAt;
}

export interface IgnoredCandidatePrintingsTable {
  id: Generated<string>;
  provider: string;
  externalId: string;
  finish: string | null;
  createdAt: CreatedAt;
}

export type CardSubmissionKind = "new_card" | "correction" | "image";

export type CardSubmissionStatus =
  | "pending"
  | "accepted"
  | "already_correct"
  | "not_applied"
  | "rejected";

export type CardSubmissionReason =
  | "duplicate"
  | "already_correct"
  | "unverified"
  | "not_a_card"
  | "bad_image";

export interface CardSubmissionsTable {
  id: Generated<string>;
  userId: string;
  provider: string;
  externalId: string;
  candidateCardId: string | null;
  kind: CardSubmissionKind;
  cardName: string;
  cardSlug: string | null;
  note: string | null;
  proposedDiff: ColumnType<string[], string[] | undefined, string[]>;
  status: ColumnType<CardSubmissionStatus, CardSubmissionStatus | undefined, CardSubmissionStatus>;
  resolutionReason: CardSubmissionReason | null;
  resolutionNote: string | null;
  resolvedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  resolvedByUserId: string | null;
  acceptedCardId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingLinkOverridesTable {
  externalId: string;
  finish: string;
  provider: string;
  printingId: string;
  createdAt: CreatedAt;
}
