import type {
  MetaEntryStatus,
  MetaEventOverlayField,
  MetaEventTier,
} from "@openrift/shared/types/enums";

import type { Repos } from "../../../deps.js";
import type { CardNameIndex } from "../../candidates/services/candidate-links.js";

/**
 * The rule tables a promote reads and never writes. A bulk pass builds this
 * once and hands it to every event it promotes.
 */
export interface MetaSourceContext {
  formatMappings: ReadonlyMap<string, string>;
  templateTiers: ReadonlyMap<string, MetaEventTier | null>;
  competitivePlayerFloor: number;
}

/** {@link MetaSourceContext} plus what resolving decklist card names needs. */
export interface MetaPromoteContext extends MetaSourceContext {
  cardIndex: CardNameIndex;
}

/** The mapping tables one pass reuses across every event it promotes. */
export async function createMetaSourceContext(repos: Repos): Promise<MetaSourceContext> {
  const [formatMappings, templateTiers, settings] = await Promise.all([
    repos.uvsgamesEvents.formatMappings(),
    repos.uvsgamesEvents.templateTiers(),
    repos.uvsgamesEvents.settings(),
  ]);
  return { formatMappings, templateTiers, competitivePlayerFloor: settings.competitivePlayerFloor };
}

/** The event columns promotion computes, before overlays. */
export interface MetaPromotedEventFacts extends Record<string, unknown> {
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  tier: MetaEventTier;
  country: string | null;
  location: string | null;
}

/** One standings row as a source published it, plus the identity promotion files it under. */
export interface StandingFacts extends Record<string, unknown> {
  identity: string;
  legacyIdentity: string;
  uvsgamesPlayerId: number | null;
  playerName: string | null;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendName: string | null;
  sourceDeckId: string | null;
  provider: string;
}

/** The source's raw value for fields the projection rewrote; empty where nothing changed. */
export type MetaSourceRawTerms = Partial<Record<MetaEventOverlayField, string>>;

export interface SourceFacts {
  raw: MetaSourceRawTerms;
  event: MetaPromotedEventFacts;
  standings: StandingFacts[];
}

export interface MetaPromoteResult {
  metaEventId: string;
  players: number;
  removedPlayers: number;
  decks: number;
  matches: number;
  phases: number;
  unresolvedNames: string[];
  mergedLines: string[];
  errors: string[];
}

/** A source with no usable format never reaches live; the reviewer maps it first. */
export class UnmappableFormatError extends Error {
  override readonly name = "UnmappableFormatError";
}

export function emptyResult(metaEventId: string): MetaPromoteResult {
  return {
    metaEventId,
    players: 0,
    removedPlayers: 0,
    decks: 0,
    matches: 0,
    phases: 0,
    unresolvedNames: [],
    mergedLines: [],
    errors: [],
  };
}

export function normalizedName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/** The identity promotes before `source_identity` existed derived from live columns. */
export function legacyIdentityOf(
  uvsgamesPlayerId: number | null,
  playerName: string | null,
): string {
  if (uvsgamesPlayerId !== null) {
    return `u${uvsgamesPlayerId}`;
  }
  return `n${normalizedName(playerName)}`;
}
