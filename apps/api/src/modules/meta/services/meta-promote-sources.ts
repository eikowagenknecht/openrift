import { WellKnown } from "@openrift/shared/well-known";

import type { Repos } from "../../../deps.js";
import { classifyMetaEventTier, countryFromAddress } from "../lib/meta-event-classify.js";
import { PLAYLOLTCG_PROVIDER } from "../lib/playloltcg-catalog.js";
import { TOPDECK_PROVIDER, topdeckFormat, topdeckLocalDay } from "../lib/topdeck-catalog.js";
import { mapSourceFormat, UVSGAMES_PROVIDER, venueLocalDay } from "../lib/uvsgames-catalog.js";
import type {
  MetaPromotedEventFacts,
  MetaSourceContext,
  MetaSourceRawTerms,
  SourceFacts,
  StandingFacts,
} from "./meta-promote-shared.js";
import {
  createMetaSourceContext,
  legacyIdentityOf,
  UnmappableFormatError,
} from "./meta-promote-shared.js";

async function uvsgamesFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  const listing = await repos.uvsgamesEvents.byKey(externalId);
  if (listing === undefined) {
    return null;
  }

  const { formatMappings, templateTiers, competitivePlayerFloor } = context;
  const standings = await repos.uvsgamesResults.standings(externalId);

  const format = mapSourceFormat(formatMappings, listing.eventFormat);
  if (format === null) {
    throw new UnmappableFormatError(
      `The source filed "${listing.name}" as a format the archive has no mapping for. Map it, then promote again.`,
    );
  }

  const playerCount = countOrNull(listing.playerCount);
  const location = listing.location === null ? null : listing.location.trim().slice(0, 500) || null;

  return {
    raw: {
      format: listing.eventFormat ?? undefined,
      eventDate: listing.startAt.toISOString(),
      // The tier is a rule's output, so its input is the template the organizer
      // picked, or the field size when no template is mapped.
      tier:
        listing.eventConfigurationTemplate === null
          ? `${playerCount ?? 0} players`
          : `template ${listing.eventConfigurationTemplate}`,
      country: location ?? undefined,
    },
    event: {
      name: listing.name.slice(0, 120),
      eventDate: venueLocalDay(listing.startAt, listing.timezone),
      format,
      playerCount,
      organizer: listing.storeName === null ? null : listing.storeName.slice(0, 120),
      notes: null,
      tier: classifyMetaEventTier(
        {
          templateTier:
            listing.eventConfigurationTemplate === null
              ? null
              : (templateTiers.get(listing.eventConfigurationTemplate) ?? null),
          playerCount,
        },
        competitivePlayerFloor,
      ),
      country: countryFromAddress(location),
      location,
    },
    standings: standings
      .filter((row) => row.rank !== null)
      .map((row) => ({
        identity:
          row.uvsgamesPlayerId === null ? `r${row.registrationId}` : `u${row.uvsgamesPlayerId}`,
        legacyIdentity: legacyIdentityOf(row.uvsgamesPlayerId, row.playerName),
        uvsgamesPlayerId: row.uvsgamesPlayerId,
        // A row the source keys by user id is rendered under that player's
        // current name, so the archive stores no snapshot of it.
        playerName: row.uvsgamesPlayerId === null ? row.playerName : null,
        rank: row.rank as number,
        rankIsTier: false,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matchPoints: row.matchPoints,
        opponentMatchWinPct: row.opponentMatchWinPct,
        gameWinPct: row.gameWinPct,
        opponentGameWinPct: row.opponentGameWinPct,
        entryStatus: row.entryStatus,
        legendName: row.legendName,
        sourceDeckId: row.sourceDeckId,
        provider: UVSGAMES_PROVIDER,
      })),
  };
}

async function playloltcgFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  const activityShopId = Number(externalId);
  if (!Number.isInteger(activityShopId)) {
    return null;
  }
  const listing = await repos.playloltcgEvents.byKey(activityShopId);
  if (listing === undefined) {
    return null;
  }
  const standings = await repos.playloltcgResults.standings(activityShopId);
  const location = listing.address === null ? null : listing.address.trim().slice(0, 500) || null;
  const playerCount = countOrNull(listing.playerCount);

  return {
    raw: {
      // This source publishes no format vocabulary; geography is always CN.
      tier: `${playerCount ?? 0} players`,
    },
    event: {
      name: listing.name.slice(0, 120),
      // The source publishes day granularity only; startAt is already the venue-local day.
      eventDate: listing.startAt ?? new Date().toISOString().slice(0, 10),
      // activityType conflates city qualifiers and play nights; not mapped, filed as constructed.
      format: WellKnown.deckFormat.CONSTRUCTED,
      playerCount,
      organizer: listing.shopName === null ? null : listing.shopName.slice(0, 120),
      notes: null,
      tier: classifyMetaEventTier(
        { templateTier: null, playerCount },
        context.competitivePlayerFloor,
      ),
      country: "CN",
      location,
    },
    standings: standings
      .filter((row) => row.rank !== null)
      .map((row) => ({
        identity: `p${row.playerKey}`,
        legacyIdentity: legacyIdentityOf(null, row.playerName),
        uvsgamesPlayerId: null,
        playerName: row.playerName,
        rank: row.rank as number,
        rankIsTier: false,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matchPoints: null,
        opponentMatchWinPct: null,
        gameWinPct: null,
        opponentGameWinPct: null,
        entryStatus: null,
        legendName: row.legendName,
        sourceDeckId: row.sourceDeckId,
        provider: PLAYLOLTCG_PROVIDER,
      })),
  };
}

async function topdeckFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  const listing = await repos.topdeckEvents.byKey(externalId);
  if (listing === undefined) {
    return null;
  }
  const standings = await repos.topdeckResults.standings(externalId);
  const location = listing.address === null ? null : listing.address.trim().slice(0, 500) || null;
  const playerCount = countOrNull(listing.playerCount);

  return {
    raw: {
      format: listing.format,
      eventDate: listing.startAt.toISOString(),
      // No template vocabulary here either, so field size is the whole rule.
      tier: `${playerCount ?? 0} players`,
      country: location ?? undefined,
    },
    event: {
      name: listing.name.slice(0, 120),
      eventDate: topdeckLocalDay(listing.startAt, listing.longitude),
      format: topdeckFormat(listing.format),
      playerCount,
      notes: null,
      // The source names no organizer, only where the event was held.
      organizer: null,
      tier: classifyMetaEventTier(
        { templateTier: null, playerCount },
        context.competitivePlayerFloor,
      ),
      country: listing.country,
      location,
    },
    standings: standings
      .filter((row) => row.rank !== null)
      .map((row) => ({
        identity: `t${row.playerKey}`,
        legacyIdentity: legacyIdentityOf(null, row.playerName),
        uvsgamesPlayerId: null,
        playerName: row.playerName,
        rank: row.rank as number,
        rankIsTier: false,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matchPoints: null,
        opponentMatchWinPct: null,
        gameWinPct: null,
        opponentGameWinPct: null,
        entryStatus: null,
        legendName: row.legendName,
        sourceDeckId: row.sourceDeckId,
        provider: TOPDECK_PROVIDER,
      })),
  };
}

/** Never throws: an unreadable mirror row returns null. */
export async function sourceEventFacts(
  repos: Repos,
  provider: string,
  externalId: string,
  context?: MetaSourceContext,
): Promise<{ values: MetaPromotedEventFacts; raw: MetaSourceRawTerms } | null> {
  try {
    const facts = await factsFor(
      repos,
      provider,
      externalId,
      context ?? (await createMetaSourceContext(repos)),
    );
    return facts === null ? null : { values: facts.event, raw: facts.raw };
  } catch {
    return null;
  }
}

/**
 * One mirror's standings as promotion would read them, identities included.
 * Never throws, for the same reason {@link sourceEventFacts} does not.
 */
export async function sourceStandings(
  repos: Repos,
  provider: string,
  externalId: string,
): Promise<StandingFacts[]> {
  try {
    const facts = await factsFor(repos, provider, externalId, await createMetaSourceContext(repos));
    return facts?.standings ?? [];
  } catch {
    return [];
  }
}

/** The listing's player count, with the source's zero-means-unreported quirk applied. */
export function countOrNull(value: number | null): number | null {
  return value === null || value === 0 ? null : value;
}

export function factsFor(
  repos: Repos,
  provider: string,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  if (provider === UVSGAMES_PROVIDER) {
    return uvsgamesFacts(repos, externalId, context);
  }
  if (provider === PLAYLOLTCG_PROVIDER) {
    return playloltcgFacts(repos, externalId, context);
  }
  if (provider === TOPDECK_PROVIDER) {
    return topdeckFacts(repos, externalId, context);
  }
  // A push provider writes overlays, not a mirror, so there is nothing here to
  // promote and its citation still stands.
  return Promise.resolve(null);
}
