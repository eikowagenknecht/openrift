import { ERROR_CODES, META_CATALOG_PROVIDERS } from "@openrift/shared";
import type {
  MetaCrossSourceReview,
  MetaCrossSourceRow,
  MetaCrossSourceState,
} from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import { resolvedStandingName } from "../lib/meta-event-naming.js";
import type { MetaEventSourceRow } from "../repositories/meta.js";
import { rankPlayerMatches } from "./meta-match-suggestions.js";
import { promoteMetaEvent, sourceStandings } from "./meta-promote.js";

/**
 * The review that turns a second mirror's citation from cited-only to read
 * (ADR-014, "Two mirrors on one event"): per standing the mirror publishes,
 * the admin names the live row it is, or that it is nobody the event already
 * lists. Nothing here decides on its own; ranking is `rankPlayerMatches`, and
 * every write is a human's confirmed pick.
 */

const MIRROR_PROVIDERS: ReadonlySet<string> = new Set(META_CATALOG_PROVIDERS);

/** The event's mirror citations, in the order promotion reads them. */
function mirrorCitations(sources: readonly MetaEventSourceRow[]) {
  return sources
    .filter(
      (source): source is MetaEventSourceRow & { provider: string; externalId: string } =>
        source.provider !== null &&
        source.externalId !== null &&
        MIRROR_PROVIDERS.has(source.provider),
    )
    .toSorted((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * The review for one event: every standings row its unread mirrors publish,
 * ranked against the live field. Empty once every linked mirror is read.
 */
export async function metaCrossSourceReview(
  repos: Repos,
  metaEventId: string,
): Promise<MetaCrossSourceReview> {
  const citations = mirrorCitations(await repos.meta.sourcesForEvent(metaEventId));
  const sources = citations.map((source) => ({
    id: source.id,
    provider: source.provider,
    externalId: source.externalId,
    contributes: source.contributes,
  }));
  const unread = citations.filter((source) => !source.contributes);
  if (unread.length === 0) {
    return { sources, rows: [] };
  }

  const [players, links] = await Promise.all([
    repos.meta.adminPlayersForEvent(metaEventId),
    repos.metaPlayerLinks.forEvent(metaEventId),
  ]);
  const decided = new Map(
    links.map((link) => [`${link.provider}:${link.sourceIdentity}`, link.metaEventPlayerId]),
  );
  // A live row one standing already claims is not offered to another entry of
  // the same mirror; the write would refuse it anyway.
  const claimed = new Map(
    links
      .filter((link) => link.metaEventPlayerId !== null)
      .map((link) => [`${link.provider}:${link.metaEventPlayerId as string}`, link.sourceIdentity]),
  );

  const rows: MetaCrossSourceRow[] = [];
  for (const source of unread) {
    const standings = await sourceStandings(repos, source.provider, source.externalId);
    const displayNames = await repos.uvsgamesEvents.playerDisplayNames(
      standings.flatMap((standing) =>
        standing.uvsgamesPlayerId === null ? [] : [standing.uvsgamesPlayerId],
      ),
    );
    for (const standing of standings) {
      const key = `${source.provider}:${standing.identity}`;
      const linked = decided.get(key) ?? null;
      let state: MetaCrossSourceState = "unreviewed";
      if (decided.has(key)) {
        state = linked === null ? "distinct" : "linked";
      }
      const offerable = players.filter((player) => {
        const taken = claimed.get(`${source.provider}:${player.id}`);
        return taken === undefined || taken === standing.identity;
      });
      const playerName = resolvedStandingName(standing, displayNames);
      rows.push({
        provider: source.provider,
        sourceIdentity: standing.identity,
        playerName,
        rank: standing.rank,
        legendName: standing.legendName,
        hasDeck: standing.sourceDeckId !== null,
        state,
        metaEventPlayerId: linked,
        suggestions: rankPlayerMatches({ playerName, rank: standing.rank }, offerable, linked),
      });
    }
  }

  return { sources, rows };
}

export interface MetaCrossSourceDecision {
  provider: string;
  sourceIdentity: string;
  metaEventPlayerId: string | null;
}

/**
 * Records decisions: this mirror's standing is that live row, or is nobody.
 * The whole batch is one transaction; a refused decision settles nothing.
 */
export async function linkMetaCrossSourcePlayers(
  repos: Repos,
  metaEventId: string,
  decisions: readonly MetaCrossSourceDecision[],
): Promise<void> {
  const [players, links] = await Promise.all([
    repos.meta.adminPlayersForEvent(metaEventId),
    repos.metaPlayerLinks.forEvent(metaEventId),
  ]);
  const playerIds = new Set(players.map((player) => player.id));
  const mintedFor = new Map(
    players
      .filter((player) => player.sourceIdentity !== null)
      .map((player) => [player.sourceIdentity as string, player.id]),
  );
  // Re-deciding an entry releases the row it claimed before the batch checks
  // for new claims.
  const redecided = new Set(
    decisions.map((decision) => `${decision.provider}:${decision.sourceIdentity}`),
  );
  const claimed = new Map(
    links
      .filter(
        (link) =>
          link.metaEventPlayerId !== null &&
          !redecided.has(`${link.provider}:${link.sourceIdentity}`),
      )
      .map((link) => [`${link.provider}:${link.metaEventPlayerId as string}`, link.sourceIdentity]),
  );

  for (const decision of decisions) {
    if (decision.metaEventPlayerId === null) {
      continue;
    }
    if (!playerIds.has(decision.metaEventPlayerId)) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "That standings row no longer exists.");
    }
    // A row promotion already minted for this identity duplicates the one
    // being linked to; promotion never deletes a published row.
    const minted = mintedFor.get(decision.sourceIdentity);
    if (minted !== undefined && minted !== decision.metaEventPlayerId) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "This entry already has its own archived standings row. Delete that row first, then link.",
      );
    }
    const rowKey = `${decision.provider}:${decision.metaEventPlayerId}`;
    if (claimed.has(rowKey)) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Another entry of this source is already linked to that standings row.",
      );
    }
    claimed.set(rowKey, decision.sourceIdentity);
  }

  await repos.metaPlayerLinks.putMany(decisions.map((decision) => ({ metaEventId, ...decision })));
  await promoteMetaEvent(repos, metaEventId);
}

/**
 * Takes one decision back, returning the standing to the unreviewed pile.
 * Refused while the source is read: stop reading it first.
 */
export async function unlinkMetaCrossSourcePlayer(
  repos: Repos,
  metaEventId: string,
  provider: string,
  sourceIdentity: string,
): Promise<void> {
  const sources = await repos.meta.sourcesForEvent(metaEventId);
  if (sources.some((source) => source.provider === provider && source.contributes)) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This source is being read. Stop reading it first, then revise the link.",
    );
  }
  if (!(await repos.metaPlayerLinks.remove(metaEventId, provider, sourceIdentity))) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That entry has not been reviewed.");
  }
  await promoteMetaEvent(repos, metaEventId);
}

/**
 * Turns a cited-but-unread mirror on, or back off. Turning it on is refused
 * while any of its standings is undecided.
 */
export async function setMetaEventSourceContributes(
  repos: Repos,
  sourceId: string,
  contributes: boolean,
): Promise<void> {
  const source = await repos.meta.eventSourceById(sourceId);
  if (source === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That citation no longer exists.");
  }
  if (source.provider === null || !MIRROR_PROVIDERS.has(source.provider)) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Only a crawled source has standings to contribute.",
    );
  }
  if (contributes) {
    const review = await metaCrossSourceReview(repos, source.metaEventId);
    const outstanding = review.rows.filter(
      (row) => row.provider === source.provider && row.state === "unreviewed",
    ).length;
    if (outstanding > 0) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `${outstanding} of this source's entries are not linked yet. Settle them first.`,
      );
    }
  }
  await repos.meta.setEventSourceContributes(sourceId, contributes);
  await promoteMetaEvent(repos, source.metaEventId);
}
