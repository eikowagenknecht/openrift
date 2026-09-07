import { ERROR_CODES } from "@openrift/shared/error-codes";

import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import { loadCardNameIndex } from "../../candidates/services/candidate-links.js";
import { metaEventSlugCandidates } from "../lib/meta-event-naming.js";
import type { MetaEventOverlayPatch } from "../lib/meta-overlay-apply.js";
import { applyOverlays } from "../lib/meta-overlay-apply.js";
import { promotePhasesAndMatches } from "./meta-promote-matches.js";
import { applyPlayerOverlays, dropOrphanMintedPlayers } from "./meta-promote-overlays.js";
import type {
  MetaPromoteContext,
  MetaPromotedEventFacts,
  MetaPromoteResult,
  SourceFacts,
} from "./meta-promote-shared.js";
import {
  createMetaSourceContext,
  emptyResult,
  UnmappableFormatError,
} from "./meta-promote-shared.js";
import { factsFor } from "./meta-promote-sources.js";
import { promoteStandings } from "./meta-promote-standings.js";

/**
 * `live = promote(sources) + accepted overlays`; there is no staging tier
 * in between. `decks`, `meta_event_matches`, and public share tokens hang
 * off `meta_event_players.id`, so a re-promote matches existing rows by
 * their stored source identity and updates in place, never deleting and re-inserting a published field.
 */

/** Everything {@link promoteMetaEvent} would otherwise load per event. */
export async function createMetaPromoteContext(repos: Repos): Promise<MetaPromoteContext> {
  const [source, cardIndex] = await Promise.all([
    createMetaSourceContext(repos),
    loadCardNameIndex(repos.ingest),
  ]);
  return { ...source, cardIndex };
}

/**
 * Rebuilds one live event from its linked mirrors and accepted overlays.
 * Idempotent, safe to run at any time and as often as needed.
 */
export async function promoteMetaEvent(
  repos: Repos,
  metaEventId: string,
  context?: MetaPromoteContext,
): Promise<MetaPromoteResult> {
  const live = await repos.meta.eventRowById(metaEventId);
  if (live === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That archived event no longer exists.");
  }
  const ctx = context ?? (await createMetaPromoteContext(repos));

  const result = emptyResult(metaEventId);
  const sources = await repos.meta.sourcesForEvent(metaEventId);
  const ordered = sources
    // A citation with `contributes` off is printed and never read; see
    // `insertEventSource`.
    .filter(
      (source) => source.provider !== null && source.externalId !== null && source.contributes,
    )
    .toSorted((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());

  const collected: SourceFacts[] = [];
  for (const source of ordered) {
    try {
      const facts = await factsFor(
        repos,
        source.provider as string,
        source.externalId as string,
        ctx,
      );
      if (facts !== null) {
        collected.push(facts);
      }
    } catch (error) {
      if (error instanceof UnmappableFormatError) {
        result.errors.push(error.message);
        continue;
      }
      throw error;
    }
  }

  const final = await promoteEventRow(repos, metaEventId, live, collected);
  await promoteStandings(repos, metaEventId, final, ordered, collected, result, ctx.cardIndex);
  await applyPlayerOverlays(repos, metaEventId, final.format, result, ctx.cardIndex);
  await dropOrphanMintedPlayers(repos, metaEventId, result);
  await promotePhasesAndMatches(repos, metaEventId, ordered, result);
  return result;
}

async function promoteEventRow(
  repos: Repos,
  metaEventId: string,
  live: MetaPromotedEventFacts,
  collected: readonly SourceFacts[],
): Promise<MetaPromotedEventFacts> {
  // Only the four NOT NULL columns fall back to the live row; every other field
  // starts unset so it goes empty when unclaimed. Sources apply in priority order.
  let facts: MetaPromotedEventFacts = {
    name: live.name,
    eventDate: live.eventDate,
    format: live.format,
    playerCount: null,
    organizer: null,
    notes: null,
    tier: live.tier,
    country: null,
    location: null,
  };
  for (const source of collected) {
    facts = { ...facts, ...source.event };
  }

  const overlays = await repos.metaOverlays.acceptedEventOverlays(metaEventId);
  const patches: MetaEventOverlayPatch<Partial<MetaPromotedEventFacts>>[] = overlays.map(
    (overlay) => ({
      claimedFields: overlay.claimedFields,
      values: {
        // applyOverlays copies any key the object owns: NOT NULL columns must
        // be omitted here, not set to undefined, when an overlay claims them empty.
        ...(overlay.name === null ? {} : { name: overlay.name }),
        ...(overlay.eventDate === null ? {} : { eventDate: overlay.eventDate }),
        ...(overlay.format === null ? {} : { format: overlay.format }),
        ...(overlay.tier === null ? {} : { tier: overlay.tier }),
        playerCount: overlay.playerCount,
        organizer: overlay.organizer,
        notes: overlay.notes,
        country: overlay.country,
        location: overlay.location,
      } as Partial<MetaPromotedEventFacts>,
    }),
  );
  const final = applyOverlays(facts, patches);

  if (!sameEventFacts(live, final)) {
    await repos.meta.updateEvent(metaEventId, {
      name: final.name,
      eventDate: final.eventDate,
      format: final.format,
      playerCount: final.playerCount,
      organizer: final.organizer,
      notes: final.notes,
      tier: final.tier,
      country: final.country,
      location: final.location,
    });
  }
  return final;
}

function sameEventFacts(live: MetaPromotedEventFacts, next: MetaPromotedEventFacts): boolean {
  return (
    live.name === next.name &&
    live.eventDate === next.eventDate &&
    live.format === next.format &&
    live.playerCount === next.playerCount &&
    live.organizer === next.organizer &&
    live.notes === next.notes &&
    live.tier === next.tier &&
    live.country === next.country &&
    live.location === next.location
  );
}

/**
 * Mints a live event for a source key that has none. The citation writes
 * first, since promotion reads `meta_event_sources` to know what to promote from.
 */
export async function promoteNewEvent(
  repos: Repos,
  provider: string | null,
  externalId: string | null,
  seed: { name: string; eventDate: string; format: string; sourceUrl: string | null },
): Promise<{ metaEventId: string; slug: string; created: boolean }> {
  if (provider !== null && externalId !== null) {
    const existing = await repos.meta.sourceByKey(provider, externalId);
    if (existing !== undefined) {
      await promoteMetaEvent(repos, existing.metaEventId);
      const live = await repos.meta.eventById(existing.metaEventId);
      return {
        metaEventId: existing.metaEventId,
        slug: live?.slug ?? "",
        created: false,
      };
    }
  }

  const slug = await resolveEventSlug(repos, seed.name, seed.eventDate);
  const created = await repos.meta.createEvent({
    slug,
    name: seed.name,
    eventDate: seed.eventDate,
    format: seed.format,
    playerCount: null,
    organizer: null,
    notes: null,
    tier: "local",
    country: null,
    location: null,
  });

  await repos.meta.insertEventSource({
    metaEventId: created.id,
    provider,
    externalId,
    label: provider ?? "Submission",
    sourceUrl: seed.sourceUrl,
  });
  await promoteMetaEvent(repos, created.id);
  return { metaEventId: created.id, slug, created: true };
}

async function resolveEventSlug(repos: Repos, name: string, eventDate: string): Promise<string> {
  for (const slug of metaEventSlugCandidates(name, eventDate)) {
    const taken = await repos.meta.eventBySlug(slug);
    if (taken === undefined) {
      return slug;
    }
  }
  throw new AppError(
    409,
    ERROR_CODES.CONFLICT,
    `Could not find a free slug for "${name}". Rename the event, or add it by hand.`,
  );
}
