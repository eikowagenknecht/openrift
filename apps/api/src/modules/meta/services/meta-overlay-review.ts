import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  MetaOverlayBulkAcceptResult,
  MetaOverlayReviewResult,
} from "@openrift/shared/types/api/meta";
import type {
  MetaEntryStatus,
  MetaEventOverlayField,
  MetaListStatus,
  MetaOverlayStatus,
  MetaPlayerOverlayField,
} from "@openrift/shared/types/enums";
import { META_EVENT_TIERS } from "@openrift/shared/types/enums";
import { stringifyUnknown } from "@openrift/shared/utils";
import type { Insertable } from "kysely";

import type { MetaEventPlayerOverlaysTable } from "../../../db/tables/meta.js";
import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { MetaPlayerOverlayRow } from "../repositories/meta-overlays.js";
import { sourceEventKeyPrefix } from "../repositories/meta-overlays.js";
import type { MetaEventPlayerRow } from "../repositories/meta-players.js";
import { promoteMetaEvent, promoteNewEvent } from "./meta-promote.js";

/** Compares the display form: the two sides type dates and numbers differently. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return (left ?? null) === (right ?? null);
  }
  return stringifyUnknown(left) === stringifyUnknown(right);
}

/**
 * A claim matching the live value would freeze it against future corrections.
 * `cards` is never dropped; `listStatus` stays claimed while `cards` is.
 */
function redundantClaims(
  claimedFields: readonly string[],
  overlay: Record<string, unknown>,
  live: Record<string, unknown>,
): string[] {
  return claimedFields.filter((field) => {
    if (field === "cards") {
      return false;
    }
    if (field === "listStatus" && claimedFields.includes("cards")) {
      return false;
    }
    if (!Object.hasOwn(live, field)) {
      return false;
    }
    return sameValue(overlay[field], live[field]);
  });
}

export async function acceptMetaEventOverlay(
  repos: Repos,
  overlayId: string,
  intoMetaEventId: string | null = null,
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  const overlay = await repos.metaOverlays.eventOverlayById(overlayId);
  if (overlay === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That overlay no longer exists.");
  }

  if (overlay.metaEventId !== null) {
    await repos.metaOverlays.setEventOverlayStatus(overlayId, "accepted", now);
    await promoteMetaEvent(repos, overlay.metaEventId);
    return { metaEventId: overlay.metaEventId, created: false };
  }

  if (intoMetaEventId !== null) {
    const target = await repos.meta.eventById(intoMetaEventId);
    if (target === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "That archived event no longer exists.");
    }
    const redundant = redundantClaims(
      overlay.claimedFields,
      overlay as unknown as Record<string, unknown>,
      target as unknown as Record<string, unknown>,
    );
    await repos.metaOverlays.updateEventOverlay(overlayId, {
      metaEventId: intoMetaEventId,
      status: "accepted",
      acceptedAt: now,
      claimedFields: overlay.claimedFields.filter(
        (field) => !redundant.includes(field),
      ) as MetaEventOverlayField[],
      ...Object.fromEntries(redundant.map((field) => [field, null])),
    });
    await repos.metaOverlays.adoptProposedPlayers(overlayId, intoMetaEventId);
    await promoteMetaEvent(repos, intoMetaEventId);
    return { metaEventId: intoMetaEventId, created: false };
  }

  // The check runs before anything is written: a failed validation must leave
  // the overlay pending, not accepted with no live event behind it.
  if (overlay.name === null || overlay.eventDate === null || overlay.format === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "A proposed event needs a name, a date and a format before it can be accepted.",
    );
  }

  // Minted before the overlay is flipped: a failure here must leave the
  // proposal pending, not accepted with no live event behind it.
  const promoted = await promoteNewEvent(repos, overlay.provider, overlay.externalId, {
    name: overlay.name,
    eventDate: overlay.eventDate,
    format: overlay.format,
    sourceUrl: null,
  });

  await repos.metaOverlays.updateEventOverlay(overlayId, {
    metaEventId: promoted.metaEventId,
    status: "accepted",
    acceptedAt: now,
  });
  await repos.metaOverlays.adoptProposedPlayers(overlayId, promoted.metaEventId);
  await promoteMetaEvent(repos, promoted.metaEventId);

  return { metaEventId: promoted.metaEventId, created: promoted.created };
}

export async function moveMetaEventOverlay(
  repos: Repos,
  overlayId: string,
  intoMetaEventId: string,
): Promise<MetaOverlayReviewResult> {
  const overlay = await repos.metaOverlays.eventOverlayById(overlayId);
  if (overlay === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That overlay no longer exists.");
  }
  if (overlay.provider === null || overlay.externalId === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Only a provider's upload can be moved; a person's overlay is a correction to one event.",
    );
  }
  if (overlay.metaEventId === intoMetaEventId) {
    return { metaEventId: intoMetaEventId, created: false };
  }
  const target = await repos.meta.eventById(intoMetaEventId);
  if (target === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That archived event no longer exists.");
  }

  const leaving = overlay.metaEventId;
  await repos.metaOverlays.reanchorPlayerOverlays(
    overlay.provider,
    overlay.externalId,
    intoMetaEventId,
  );
  await repos.metaOverlays.updateEventOverlay(overlayId, { metaEventId: intoMetaEventId });
  if (leaving !== null) {
    await promoteMetaEvent(repos, leaving);
  }
  await promoteMetaEvent(repos, intoMetaEventId);
  return { metaEventId: intoMetaEventId, created: false };
}

export interface MetaUploadSummary {
  eventOverlayId: string;
  provider: string;
  externalId: string;
  status: MetaOverlayStatus;
  /** ISO 8601, as every other wire timestamp. */
  acceptedAt: string | null;
  acceptedPlayers: number;
  pendingPlayers: number;
  mintedPlayers: number;
}

export async function listMetaUploadsForEvent(
  repos: Repos,
  metaEventId: string,
): Promise<MetaUploadSummary[]> {
  const overlays = await repos.metaOverlays.pushOverlaysForEvent(metaEventId);
  const allPlayers = await repos.metaOverlays.playerOverlaysForSourceEvents(overlays);
  const accepted = allPlayers.filter((player) => player.status === "accepted");
  const minted = await repos.meta.mintedPlayerCounts(accepted.map((player) => player.id));
  return overlays.map((overlay) => {
    const prefix = sourceEventKeyPrefix(overlay.externalId);
    const players = allPlayers.filter(
      (player) =>
        player.provider === overlay.provider && player.sourcePlayerKey?.startsWith(prefix) === true,
    );
    return {
      eventOverlayId: overlay.id,
      provider: overlay.provider,
      externalId: overlay.externalId,
      status: overlay.status,
      acceptedAt: overlay.acceptedAt?.toISOString() ?? null,
      acceptedPlayers: players.filter((player) => player.status === "accepted").length,
      pendingPlayers: players.filter((player) => player.status === "pending").length,
      mintedPlayers: players.reduce((sum, player) => sum + (minted.get(player.id) ?? 0), 0),
    };
  });
}

export interface MetaUploadRevertResult {
  metaEventIds: string[];
  players: number;
  eventRejected: boolean;
}

/**
 * Rejects one upload whole, event overlay and every standings overlay it
 * wrote. Nothing is deleted, so a corrected file can be accepted again.
 */
export async function revertMetaUpload(
  repos: Repos,
  provider: string,
  eventExternalId: string,
  now: Date = new Date(),
): Promise<MetaUploadRevertResult> {
  const players = await repos.metaOverlays.playerOverlaysForSourceEvent(provider, eventExternalId);
  const [eventOverlay] = await repos.metaOverlays.eventOverlaysBySourceKeys(provider, [
    eventExternalId,
  ]);
  if (eventOverlay === undefined && players.length === 0) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "No upload with that source key exists.");
  }

  const affected = new Set<string>();
  for (const player of players) {
    const metaEventId = await eventIdForPlayerOverlay(repos, player);
    if (metaEventId !== null) {
      affected.add(metaEventId);
    }
  }
  if (eventOverlay !== undefined && eventOverlay.metaEventId !== null) {
    affected.add(eventOverlay.metaEventId);
  }

  const settled = players.filter((player) => player.status !== "rejected");
  await repos.metaOverlays.setPlayerOverlayStatuses(
    settled.map((player) => player.id),
    "rejected",
    now,
  );
  let eventRejected = false;
  if (eventOverlay !== undefined && eventOverlay.status !== "rejected") {
    await repos.metaOverlays.setEventOverlayStatus(eventOverlay.id, "rejected", now);
    eventRejected = true;
  }

  for (const metaEventId of affected) {
    await promoteMetaEvent(repos, metaEventId);
  }

  return { metaEventIds: [...affected], players: settled.length, eventRejected };
}

export interface MetaEventFieldEdit {
  field: MetaEventOverlayField;
  value: string | null;
}

/**
 * One admin's edits merge into a single row per author. `acceptedAt` moves to
 * now on each merge, so the latest edit outranks overlays accepted between.
 */
export async function writeEventOverlayFields(
  repos: Repos,
  metaEventId: string,
  edits: readonly MetaEventFieldEdit[],
  authorUserId: string,
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  const live = await repos.meta.eventById(metaEventId);
  if (live === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That archived event no longer exists.");
  }
  if (edits.length === 0) {
    return { metaEventId, created: false };
  }

  const columns: Record<string, unknown> = {};
  for (const edit of edits) {
    Object.assign(columns, coerceEventField(edit.field, edit.value));
  }
  const fields = [...new Set(edits.map((edit) => edit.field))];

  const existing = await repos.metaOverlays.adminEditOverlay(metaEventId, authorUserId);
  await (existing === undefined
    ? repos.metaOverlays.insertEventOverlay({
        metaEventId,
        claimedFields: fields,
        status: "accepted",
        acceptedAt: now,
        submittedByUserId: authorUserId,
        ...columns,
      })
    : repos.metaOverlays.updateEventOverlay(existing.id, {
        claimedFields: [...new Set([...existing.claimedFields, ...fields])],
        acceptedAt: now,
        ...columns,
      }));
  await promoteMetaEvent(repos, metaEventId);
  return { metaEventId, created: false };
}

/**
 * An admin-edit row whose last claim goes is deleted. A submission's claim
 * list must stay non-empty by CHECK, so releasing its last claim rejects it.
 */
export async function releaseEventOverlayField(
  repos: Repos,
  metaEventId: string,
  field: MetaEventOverlayField,
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  const live = await repos.meta.eventById(metaEventId);
  if (live === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That archived event no longer exists.");
  }

  const overlays = await repos.metaOverlays.acceptedEventOverlays(metaEventId);
  for (const overlay of overlays) {
    if (!overlay.claimedFields.includes(field)) {
      continue;
    }
    const remaining = overlay.claimedFields.filter((claimed) => claimed !== field);
    const isAdminEdit = overlay.provider === null && overlay.submissionNote === null;
    if (remaining.length === 0 && isAdminEdit) {
      await repos.metaOverlays.deleteEventOverlay(overlay.id);
      continue;
    }
    if (remaining.length === 0) {
      await repos.metaOverlays.setEventOverlayStatus(overlay.id, "rejected", now);
      continue;
    }
    await repos.metaOverlays.updateEventOverlay(overlay.id, {
      claimedFields: remaining,
      [field]: null,
    });
  }

  await promoteMetaEvent(repos, metaEventId);
  return { metaEventId, created: false };
}

function coerceEventField(
  field: MetaEventOverlayField,
  value: string | null,
): Record<string, unknown> {
  const trimmed = value === null ? null : value.trim();
  const empty = trimmed === null || trimmed === "";

  if (field === "playerCount") {
    if (empty) {
      return { playerCount: null };
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Player count must be a positive whole number.",
      );
    }
    return { playerCount: parsed };
  }

  if (field === "tier") {
    if (empty || !(META_EVENT_TIERS as readonly string[]).includes(trimmed)) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Tier must be one of ${META_EVENT_TIERS.join(", ")}.`,
      );
    }
    return { tier: trimmed };
  }

  if (field === "eventDate") {
    if (empty || !/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "The date must be YYYY-MM-DD.");
    }
    return { eventDate: trimmed };
  }

  // name and format have a NOT NULL constraint on the live row.
  if ((field === "name" || field === "format") && empty) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, `An event must keep its ${field}.`);
  }

  return { [field]: empty ? null : trimmed };
}

export interface MetaPlayerFieldEdits {
  playerName?: string | null;
  rank?: number;
  rankIsTier?: boolean;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  matchPoints?: number | null;
  opponentMatchWinPct?: number | null;
  gameWinPct?: number | null;
  opponentGameWinPct?: number | null;
  entryStatus?: MetaEntryStatus | null;
  legendCardId?: string | null;
  championCardId?: string | null;
}

export interface MetaPlayerOverlayList {
  name?: string;
  cards: { cardId: string; zone: string; quantity: number; preferredPrintingId?: string | null }[];
  listStatus: Exclude<MetaListStatus, "none">;
}

const PLAYER_SCALAR_FIELDS = [
  "playerName",
  "rank",
  "rankIsTier",
  "wins",
  "losses",
  "draws",
  "matchPoints",
  "opponentMatchWinPct",
  "gameWinPct",
  "opponentGameWinPct",
  "entryStatus",
  "legendCardId",
  "championCardId",
] as const satisfies readonly MetaPlayerOverlayField[];

/**
 * A list's `name` renames the deck after promote; promotion leaves deck
 * names alone otherwise.
 */
export async function writeMetaPlayerOverlayFields(
  repos: Repos,
  metaEventPlayerId: string,
  edits: { fields?: MetaPlayerFieldEdits; list?: MetaPlayerOverlayList | null },
  authorUserId: string,
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  const metaEventId = await repos.meta.eventIdForPlayer(metaEventPlayerId);
  if (metaEventId === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That standings row no longer exists.");
  }

  const fields = edits.fields ?? {};
  const claimedScalars = PLAYER_SCALAR_FIELDS.filter((field) => Object.hasOwn(fields, field));
  const claimed: MetaPlayerOverlayField[] = [...claimedScalars];
  const columns: Record<string, unknown> = Object.fromEntries(
    claimedScalars.map((field) => [field, fields[field]]),
  );

  if (fields.playerName === null) {
    const rows = await repos.meta.rawStandingsForEvent(metaEventId);
    const row = rows.find((candidate) => candidate.id === metaEventPlayerId);
    if (row?.uvsgamesPlayerId === null) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "This entry has no source name to fall back to, so it must keep a name.",
      );
    }
  }

  let lines:
    | {
        lineNumber: number;
        zone: string;
        quantity: number;
        cardName: string;
        cardId: string;
        preferredPrintingId: string | null;
      }[]
    | undefined;
  if (edits.list !== undefined) {
    claimed.push("cards", "listStatus");
    columns.listStatus = edits.list === null ? "none" : edits.list.listStatus;
    lines = edits.list === null ? [] : await toOverlayLines(repos, edits.list.cards);
  }

  if (claimed.length === 0) {
    return { metaEventId, created: false };
  }

  const existing = await repos.metaOverlays.adminPlayerEditOverlay(metaEventPlayerId, authorUserId);
  await (existing === undefined
    ? repos.metaOverlays.insertPlayerOverlay(
        {
          metaEventPlayerId,
          metaEventId: null,
          eventOverlayId: null,
          claimedFields: claimed,
          status: "accepted",
          acceptedAt: now,
          submittedByUserId: authorUserId,
          ...columns,
        } as Insertable<MetaEventPlayerOverlaysTable>,
        lines ?? [],
      )
    : repos.metaOverlays.updatePlayerOverlay(
        existing.id,
        {
          claimedFields: [...new Set([...existing.claimedFields, ...claimed])],
          acceptedAt: now,
          ...columns,
        },
        lines,
      ));

  await promoteMetaEvent(repos, metaEventId);
  if (edits.list !== null && edits.list?.name !== undefined) {
    // After the promote, so a freshly claimed list has its deck to rename.
    await repos.meta.renamePlayerDeck(metaEventPlayerId, edits.list.name);
  }
  return { metaEventId, created: false };
}

/**
 * The submitted lines as overlay card rows, every id resolved to its canonical
 * name so promotion and the queue read the same words the catalog uses.
 */
async function toOverlayLines(
  repos: Repos,
  cards: MetaPlayerOverlayList["cards"],
): Promise<
  {
    lineNumber: number;
    zone: string;
    quantity: number;
    cardName: string;
    cardId: string;
    preferredPrintingId: string | null;
  }[]
> {
  const names = await repos.catalog.cardNamesByIds(cards.map((card) => card.cardId));
  return cards.map((card, lineNumber) => {
    const cardName = names.get(card.cardId);
    if (cardName === undefined) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A card in the list no longer exists.");
    }
    return {
      lineNumber,
      zone: card.zone,
      quantity: card.quantity,
      cardName,
      cardId: card.cardId,
      preferredPrintingId: card.preferredPrintingId ?? null,
    };
  });
}

/**
 * `cards` and `listStatus` release together: a list and its status can never
 * disagree.
 */
export async function releaseMetaPlayerOverlayField(
  repos: Repos,
  metaEventPlayerId: string,
  field: MetaPlayerOverlayField,
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  const metaEventId = await repos.meta.eventIdForPlayer(metaEventPlayerId);
  if (metaEventId === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That standings row no longer exists.");
  }

  const released: MetaPlayerOverlayField[] =
    field === "cards" || field === "listStatus" ? ["cards", "listStatus"] : [field];
  const accepted = await repos.metaOverlays.acceptedPlayerOverlays(metaEventId);
  const overlays = accepted.filter(
    (overlay) =>
      overlay.metaEventPlayerId === metaEventPlayerId &&
      overlay.claimedFields.some((claim) => released.includes(claim)),
  );

  for (const overlay of overlays) {
    const remaining = overlay.claimedFields.filter((claim) => !released.includes(claim));
    const isAdminEdit = overlay.provider === null && overlay.submissionNote === null;
    if (remaining.length === 0 && isAdminEdit) {
      await repos.metaOverlays.deletePlayerOverlay(overlay.id);
      continue;
    }
    if (remaining.length === 0) {
      await repos.metaOverlays.setPlayerOverlayStatus(overlay.id, "rejected", now);
      continue;
    }
    const cleared = Object.fromEntries(
      released.filter((claim) => claim !== "cards").map((claim) => [claim, null]),
    );
    await repos.metaOverlays.updatePlayerOverlay(
      overlay.id,
      { claimedFields: remaining, ...cleared },
      released.includes("cards") && isAdminEdit ? [] : undefined,
    );
  }

  await promoteMetaEvent(repos, metaEventId);
  return { metaEventId, created: false };
}

interface PendingPlayerAccept {
  overlay: MetaPlayerOverlayRow;
  player: MetaEventPlayerRow | null;
  metaEventId: string;
  fields?: MetaPlayerOverlayField[] | null;
}

async function loadPlayerAccept(
  repos: Repos,
  overlayId: string,
  metaEventPlayerId: string | null,
): Promise<PendingPlayerAccept> {
  const overlay = await repos.metaOverlays.playerOverlayById(overlayId);
  if (overlay === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That overlay no longer exists.");
  }
  let player: MetaEventPlayerRow | null = null;
  let metaEventId = await eventIdForPlayerOverlay(repos, overlay);
  if (metaEventPlayerId !== null) {
    player = (await repos.meta.playerById(metaEventPlayerId)) ?? null;
    if (player === null) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "That standings row no longer exists.");
    }
    metaEventId = (await repos.meta.eventIdForPlayer(metaEventPlayerId)) ?? metaEventId;
  }
  if (metaEventId === null) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This entry belongs to an event that has not been accepted yet. Accept the event first.",
    );
  }
  return { overlay, player, metaEventId };
}

/**
 * Callers must narrow using the returned claims, not the overlay's original
 * ones, or narrowing reclaims a field this just nulled.
 */
async function anchorPlayerOverlay(
  repos: Repos,
  overlay: MetaPlayerOverlayRow,
  player: MetaEventPlayerRow,
): Promise<MetaPlayerOverlayField[]> {
  await repos.metaOverlays.linkPlayerOverlay(overlay.id, player.id);
  const redundant = redundantClaims(
    overlay.claimedFields,
    overlay as unknown as Record<string, unknown>,
    player as unknown as Record<string, unknown>,
  );
  if (redundant.length === 0) {
    return [...overlay.claimedFields];
  }
  const remaining = overlay.claimedFields.filter(
    (field) => !redundant.includes(field),
  ) as MetaPlayerOverlayField[];
  await repos.metaOverlays.updatePlayerOverlay(overlay.id, {
    claimedFields: remaining,
    ...Object.fromEntries(redundant.map((field) => [field, null])),
  });
  return remaining;
}

/**
 * Drops claims an accept was told to leave behind. The card rows survive a
 * dropped `cards` claim; clearing them would read as a change on re-upload.
 */
async function narrowPlayerClaims(
  repos: Repos,
  overlayId: string,
  claimed: readonly MetaPlayerOverlayField[],
  fields: readonly MetaPlayerOverlayField[] | null,
): Promise<void> {
  if (fields === null) {
    return;
  }
  const kept = new Set<MetaPlayerOverlayField>(fields);
  if (kept.has("cards") || kept.has("listStatus")) {
    kept.add("cards");
    kept.add("listStatus");
  }
  const remaining = claimed.filter((claim) => kept.has(claim));
  // claimed.length === 0 means the anchor already dropped every claim as
  // redundant: a finished accept, not an empty mask.
  if (remaining.length === 0 && claimed.length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "An accept that keeps no claim is a reject. Reject the row instead.",
    );
  }
  if (remaining.length === claimed.length) {
    return;
  }
  const cleared = Object.fromEntries(
    claimed.filter((claim) => !kept.has(claim) && claim !== "cards").map((claim) => [claim, null]),
  );
  await repos.metaOverlays.updatePlayerOverlay(overlayId, {
    claimedFields: remaining,
    ...cleared,
  });
}

/**
 * Settles the ledger row and credit behind an accepted overlay. Must run
 * after promotion, which resolves the overlay's live player row.
 */
async function recordOverlayAcceptance(
  repos: Repos,
  overlayId: string,
  metaEventId: string,
  reviewedByUserId: string | null,
  now: Date,
): Promise<void> {
  const submission = await repos.metaSubmissions.byPlayerOverlayId(overlayId);
  if (submission === null) {
    return;
  }
  const settled = await repos.metaOverlays.playerOverlayById(overlayId);
  const metaEventPlayerId = settled?.metaEventPlayerId ?? null;
  const player =
    metaEventPlayerId === null ? undefined : await repos.meta.playerById(metaEventPlayerId);
  await repos.metaSubmissions.recordAcceptance({
    submissionId: submission.id,
    credit: { metaEventId, metaEventPlayerId, userId: submission.userId },
    acceptedDeckId: player?.deckId ?? null,
    resolvedAt: now,
    resolvedByUserId: reviewedByUserId,
  });
}

export async function acceptMetaPlayerOverlay(
  repos: Repos,
  overlayId: string,
  options: {
    metaEventPlayerId?: string | null;
    fields?: MetaPlayerOverlayField[] | null;
    reviewedByUserId?: string | null;
  } = {},
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  const { overlay, player, metaEventId } = await loadPlayerAccept(
    repos,
    overlayId,
    options.metaEventPlayerId ?? null,
  );
  const claimed =
    player === null
      ? [...overlay.claimedFields]
      : await anchorPlayerOverlay(repos, overlay, player);
  await narrowPlayerClaims(repos, overlayId, claimed, options.fields ?? null);
  await repos.metaOverlays.setPlayerOverlayStatus(overlayId, "accepted", now);
  await promoteMetaEvent(repos, metaEventId);
  await recordOverlayAcceptance(
    repos,
    overlayId,
    metaEventId,
    options.reviewedByUserId ?? null,
    now,
  );
  return { metaEventId, created: false };
}

/**
 * Every item is resolved before anything is written, so a stale id refuses
 * the whole batch, and each touched event is promoted once at the end.
 */
export async function acceptMetaPlayerOverlays(
  repos: Repos,
  items: readonly {
    id: string;
    metaEventPlayerId: string | null;
    fields?: MetaPlayerOverlayField[] | null;
  }[],
  reviewedByUserId: string | null = null,
  now: Date = new Date(),
): Promise<MetaOverlayBulkAcceptResult> {
  const pending: PendingPlayerAccept[] = [];
  for (const item of items) {
    pending.push({
      ...(await loadPlayerAccept(repos, item.id, item.metaEventPlayerId)),
      fields: item.fields ?? null,
    });
  }
  for (const { overlay, player, fields } of pending) {
    const claimed =
      player === null
        ? [...overlay.claimedFields]
        : await anchorPlayerOverlay(repos, overlay, player);
    await narrowPlayerClaims(repos, overlay.id, claimed, fields ?? null);
    await repos.metaOverlays.setPlayerOverlayStatus(overlay.id, "accepted", now);
  }
  const metaEventIds = [...new Set(pending.map((entry) => entry.metaEventId))];
  for (const metaEventId of metaEventIds) {
    await promoteMetaEvent(repos, metaEventId);
  }
  for (const { overlay, metaEventId } of pending) {
    await recordOverlayAcceptance(repos, overlay.id, metaEventId, reviewedByUserId, now);
  }
  return { accepted: pending.length, metaEventIds };
}

/**
 * Anchors a standings overlay to the live row it describes, then promotes so
 * an already-accepted overlay lands immediately.
 */
export async function linkMetaPlayerOverlay(
  repos: Repos,
  overlayId: string,
  metaEventPlayerId: string,
): Promise<MetaOverlayReviewResult> {
  const overlay = await repos.metaOverlays.playerOverlayById(overlayId);
  if (overlay === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That overlay no longer exists.");
  }
  const player = await repos.meta.playerById(metaEventPlayerId);
  if (player === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That standings row no longer exists.");
  }

  await anchorPlayerOverlay(repos, overlay, player);
  const metaEventId = await repos.meta.eventIdForPlayer(metaEventPlayerId);
  if (overlay.status === "accepted" && metaEventId !== undefined) {
    await promoteMetaEvent(repos, metaEventId);
  }
  return { metaEventId: metaEventId ?? null, created: false };
}

/**
 * Promotion runs afterward only if the overlay had been applied:
 * un-accepting a patch must put the promoted value back, which a re-promote does.
 */
export async function rejectMetaOverlay(
  repos: Repos,
  target: { kind: "event" | "player"; id: string },
  now: Date = new Date(),
): Promise<MetaOverlayReviewResult> {
  if (target.kind === "event") {
    const overlay = await repos.metaOverlays.eventOverlayById(target.id);
    if (overlay === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "That overlay no longer exists.");
    }
    const wasApplied = overlay.status === "accepted";
    await repos.metaOverlays.setEventOverlayStatus(target.id, "rejected", now);
    if (wasApplied && overlay.metaEventId !== null) {
      await promoteMetaEvent(repos, overlay.metaEventId);
    }
    return { metaEventId: overlay.metaEventId, created: false };
  }

  const overlay = await repos.metaOverlays.playerOverlayById(target.id);
  if (overlay === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That overlay no longer exists.");
  }
  const wasApplied = overlay.status === "accepted";
  const metaEventId = await eventIdForPlayerOverlay(repos, overlay);
  await repos.metaOverlays.setPlayerOverlayStatus(target.id, "rejected", now);
  if (wasApplied && metaEventId !== null) {
    await promoteMetaEvent(repos, metaEventId);
  }
  return { metaEventId, created: false };
}

async function eventIdForPlayerOverlay(
  repos: Repos,
  overlay: {
    metaEventId: string | null;
    metaEventPlayerId: string | null;
    eventOverlayId: string | null;
  },
): Promise<string | null> {
  if (overlay.metaEventId !== null) {
    return overlay.metaEventId;
  }
  if (overlay.metaEventPlayerId !== null) {
    return (await repos.meta.eventIdForPlayer(overlay.metaEventPlayerId)) ?? null;
  }
  if (overlay.eventOverlayId !== null) {
    const parent = await repos.metaOverlays.eventOverlayById(overlay.eventOverlayId);
    return parent?.metaEventId ?? null;
  }
  return null;
}
