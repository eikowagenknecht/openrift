import { ERROR_CODES } from "@openrift/shared/error-codes";
import { formatDay } from "@openrift/shared/format-date";
import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared/types/api/card-trade";

import type { Repos, Transact } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import { isUniqueViolation } from "../../../lib/pg-errors.js";
import { disposeCopiesInTransaction } from "../../collections/services/copies.js";
import { logEvents } from "../../system/services/event-logger.js";
import type { TradeCopyRow } from "../lib/card-trade-presenters.js";
import {
  selectSplitPins,
  sortCopiesForPinning,
  toCardTradeCopyOptions,
  toCardTradeResponse,
} from "../lib/card-trade-presenters.js";
import { claimCopiesForOffers } from "../lib/trade-offer-claims.js";
import type { CardTrade, LiveCardTrade } from "../repositories/card-trades.js";
import type { TradeEmailDeps } from "./trade-notifications.js";
import { sendTradeRequestEmail } from "./trade-notifications.js";

const PENDING_TTL_HOURS = 24 * 7;

export interface CreateTradeInput {
  callerUserId: string;
  groupSlug: string;
  counterpartyUserId: string;
  role: CardTradeRole;
  printingId: string;
  quantity: number;
}

function callerRole(trade: CardTrade, userId: string): CardTradeRole | null {
  if (trade.giverUserId === userId) {
    return "giver";
  }
  if (trade.receiverUserId === userId) {
    return "receiver";
  }
  return null;
}

function tooFewAvailable(count: number): AppError {
  const noun = count === 1 ? "copy is" : "copies are";
  return new AppError(409, ERROR_CODES.CONFLICT, `Only ${count} ${noun} still available`);
}

async function reloadDto(
  repos: Repos,
  tradeId: string,
  userId: string,
): Promise<CardTradeResponse> {
  const row = await repos.cardTrades.getDtoRowByIdForUser(tradeId, userId);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Trade not found");
  }
  return toCardTradeResponse(row, userId);
}

/**
 * Deleting an account or friend group nulls the id it owned and cancels live
 * trades in the same trigger, so a trade missing any of the three is finished.
 */
function requireLiveTrade(trade: CardTrade): LiveCardTrade {
  const { groupId, giverUserId, receiverUserId } = trade;
  if (groupId === null) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This trade is closed: its friend group was deleted",
    );
  }
  if (giverUserId === null || receiverUserId === null) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This trade is closed: the other party deleted their account",
    );
  }
  return { ...trade, groupId, giverUserId, receiverUserId };
}

async function loadTradeForParty(
  repos: Repos,
  tradeId: string,
  byUserId: string,
): Promise<{ trade: LiveCardTrade; role: CardTradeRole }> {
  const trade = await repos.cardTrades.getById(tradeId);
  if (trade === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Trade not found");
  }
  const role = callerRole(trade, byUserId);
  if (role === null) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "You are not a party to this trade");
  }
  return { trade: requireLiveTrade(trade), role };
}

function assertTradeStatus(trade: CardTrade, expected: CardTrade["status"], message: string): void {
  if (trade.status !== expected) {
    throw new AppError(409, ERROR_CODES.CONFLICT, message);
  }
}

function assertRecipient(trade: CardTrade, role: CardTradeRole, action: string): void {
  if (role === trade.initiator) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, `Only the recipient can ${action} this trade`);
  }
}

/**
 * Offers count against supply; requests are bids that claim nothing.
 * `excludeTradeId` excludes the trade being resized from its own claim.
 */
async function assertSupplyAvailable(
  repos: Repos,
  groupId: string,
  giverUserId: string,
  printingId: string,
  quantity: number,
  excludeTradeId?: string,
): Promise<void> {
  const pending = await repos.cardTrades.listPendingForGiverPrinting(giverUserId, printingId);
  const offers = pending.filter(
    (trade) => trade.initiator === "giver" && trade.id !== excludeTradeId,
  );
  const supplyByGroup = await readSupplyByGroup(
    repos,
    new Set([groupId, ...offers.map((offer) => offer.groupId)]),
    giverUserId,
    printingId,
  );
  const { claimed } = claimCopiesForOffers(offers, supplyByGroup);
  const available = (supplyByGroup.get(groupId) ?? []).filter((copyId) => !claimed.has(copyId));
  if (quantity > available.length) {
    throw tooFewAvailable(available.length);
  }
}

/** Sequential: the repos may be bound to a single transaction connection. */
async function readSupplyByGroup(
  repos: Repos,
  groupIds: Iterable<string>,
  giverUserId: string,
  printingId: string,
): Promise<Map<string, string[]>> {
  const byGroup = new Map<string, string[]>();
  for (const groupId of groupIds) {
    const { unreservedCopyIds } = await repos.friendGroupMatches.giverPrintingSupply({
      groupId,
      giverUserId,
      printingId,
    });
    byGroup.set(groupId, unreservedCopyIds);
  }
  return byGroup;
}

/**
 * Threshold is the trade's own `quantity`, not zero. Runs inside the caller's
 * transaction so the supply drop and the cancellations commit together.
 */
export async function autoCancelUnfillablePendingTrades(
  trxRepos: Repos,
  giverUserId: string,
  printingId: string,
): Promise<string[]> {
  const pending = await trxRepos.cardTrades.listPendingForGiverPrinting(giverUserId, printingId);
  if (pending.length === 0) {
    return [];
  }

  const supplyByGroup = await readSupplyByGroup(
    trxRepos,
    new Set(pending.map((trade) => trade.groupId)),
    giverUserId,
    printingId,
  );

  const cancelled: string[] = [];
  const cancel = async (tradeId: string): Promise<void> => {
    // Guarded on `status = 'pending'`, so a concurrent accept/decline that
    // already moved the row wins and nothing is recorded here.
    if ((await trxRepos.cardTrades.markAutoCancelled(tradeId)) > 0) {
      cancelled.push(tradeId);
    }
  };

  // Offers claim first, oldest first — the same allocation assertSupplyAvailable
  // runs, so a trade this sweep keeps is exactly one createTrade would allow.
  const { claimed, unfillable } = claimCopiesForOffers(
    pending.filter((trade) => trade.initiator === "giver"),
    supplyByGroup,
  );
  for (const offer of unfillable) {
    await cancel(offer.id);
  }

  // Requests are bids, not commitments: they never consume from each other, so
  // each is judged against what the surviving offers left.
  for (const trade of pending) {
    if (trade.initiator === "giver") {
      continue;
    }
    const free = (supplyByGroup.get(trade.groupId) ?? []).filter((copyId) => !claimed.has(copyId));
    if (free.length < trade.quantity) {
      await cancel(trade.id);
    }
  }

  return cancelled;
}

async function claimGiverSyncSide(repos: Repos, tradeId: string): Promise<void> {
  if ((await repos.cardTrades.setGiverSyncApplied(tradeId)) === 0) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "You've already resolved your side");
  }
}

async function claimReceiverSyncSide(repos: Repos, tradeId: string): Promise<void> {
  if ((await repos.cardTrades.setReceiverSyncApplied(tradeId)) === 0) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "You've already resolved your side");
  }
}

export async function createTrade(
  repos: Repos,
  input: CreateTradeInput,
  emailDeps?: TradeEmailDeps,
): Promise<CardTradeResponse> {
  const { callerUserId, groupSlug, counterpartyUserId, role, printingId, quantity } = input;

  if (counterpartyUserId === callerUserId) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "You cannot trade with yourself");
  }

  const group = await repos.friendGroups.getBySlugOrPrevious(groupSlug);
  if (group === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
  }
  const callerMembership = await repos.friendGroups.getMembership(group.id, callerUserId);
  if (callerMembership === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
  }
  const counterpartyMembership = await repos.friendGroups.getMembership(
    group.id,
    counterpartyUserId,
  );
  if (counterpartyMembership === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Counterparty is not a member of this group");
  }

  const giverUserId = role === "giver" ? callerUserId : counterpartyUserId;
  const receiverUserId = role === "giver" ? counterpartyUserId : callerUserId;

  const matchRows =
    role === "receiver"
      ? await repos.friendGroupMatches.othersHaveYourWants({
          groupId: group.id,
          viewerUserId: callerUserId,
          counterpartyUserId,
        })
      : await repos.friendGroupMatches.othersWantYourHaves({
          groupId: group.id,
          viewerUserId: callerUserId,
          counterpartyUserId,
        });
  const [primaryMatch] = matchRows.filter((row) => row.printingId === printingId);
  if (!primaryMatch) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "That card is no longer available to trade");
  }
  const { buyEntryId: receiverWishEntryId, cardId, buyQuantity: demandQuantity } = primaryMatch;

  // Must run before the supply check: its own pending offer holds the copy,
  // which would pass the supply check and mask this one.
  const existing = await repos.cardTrades.findLiveTrade(
    group.id,
    giverUserId,
    receiverUserId,
    printingId,
  );
  if (existing !== undefined) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "A live trade for this card already exists");
  }

  await assertSupplyAvailable(repos, group.id, giverUserId, printingId, quantity);
  // Never trade more than the wanting side wants — over-trading would
  // over-credit copies and drive the wishlist negative on sync.
  if (quantity > demandQuantity) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      role === "giver"
        ? `They only want ${demandQuantity} of this card`
        : `You only want ${demandQuantity} of this card`,
    );
  }

  const expiresAt = new Date(Date.now() + PENDING_TTL_HOURS * 60 * 60 * 1000);
  let created: LiveCardTrade;
  try {
    created = await repos.cardTrades.create({
      groupId: group.id,
      giverUserId,
      receiverUserId,
      initiator: role,
      printingId,
      cardId,
      quantity,
      receiverWishEntryId,
      lastActorUserId: callerUserId,
      expiresAt,
    });
  } catch (error) {
    // Lost a race to the unique partial index uq_card_trades_live.
    if (isUniqueViolation(error)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "A live trade for this card already exists");
    }
    throw error;
  }

  // Best-effort (the helper swallows its own errors) so a mail failure can
  // never fail the trade — the bell stays the source of truth.
  if (emailDeps !== undefined) {
    await sendTradeRequestEmail(repos, created, emailDeps);
  }

  return reloadDto(repos, created.id, callerUserId);
}

/**
 * Without an explicit pick the plainest copies go first. A pick is honoured
 * only once every id is confirmed to be in `availableCopyIds`.
 */
async function resolvePinnedCopyIds(
  trxRepos: Repos,
  trade: LiveCardTrade,
  role: CardTradeRole,
  availableCopyIds: string[],
  chosenCopyIds?: string[],
): Promise<string[]> {
  if (chosenCopyIds === undefined) {
    if (availableCopyIds.length === trade.quantity) {
      return availableCopyIds;
    }
    const rows = await trxRepos.copies.listMetadataByIds(availableCopyIds);
    const ordered = sortCopiesForPinning(rows).map((row) => row.id);
    // An id with no metadata row cannot happen under the lock. If it ever did,
    // dropping it would silently shrink the pin, so append it instead.
    const seen = new Set(ordered);
    return [...ordered, ...availableCopyIds.filter((id) => !seen.has(id))].slice(0, trade.quantity);
  }

  if (role !== "giver") {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the giver can choose which copies to promise",
    );
  }
  const unique = new Set(chosenCopyIds);
  if (unique.size !== chosenCopyIds.length) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "Choose each copy only once");
  }
  if (unique.size !== trade.quantity) {
    const noun = trade.quantity === 1 ? "copy" : "copies";
    throw new AppError(409, ERROR_CODES.CONFLICT, `Choose exactly ${trade.quantity} ${noun}`);
  }
  const available = new Set(availableCopyIds);
  if (chosenCopyIds.some((id) => !available.has(id))) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "One of those copies is no longer available to trade",
    );
  }
  return chosenCopyIds;
}

/**
 * Deliberately wider than the accept path's candidate set: this one runs
 * after the cards changed hands and records a copy the group never saw.
 */
async function listSettleCandidateCopies(
  repos: Repos,
  trade: LiveCardTrade,
  pinnedCopyIds: readonly string[],
): Promise<TradeCopyRow[]> {
  // Sequential: transaction-bound repos share one connection.
  const pinned = await repos.copies.listMetadataByIds(pinnedCopyIds);
  const free = await repos.copies.listFreePersonalMetadataForPrinting(
    trade.giverUserId,
    trade.printingId,
  );
  return [...pinned, ...free];
}

/** Giver-only because the rows carry the owner's private notes. */
export async function listTradeCopyOptions(
  repos: Repos,
  tradeId: string,
  byUserId: string,
): Promise<CardTradeCopyOptionsResponse> {
  const { trade, role } = await loadTradeForParty(repos, tradeId, byUserId);
  if (role !== "giver") {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the giver can see the copies behind this trade",
    );
  }

  if (trade.status === "pending") {
    const { unreservedCopyIds } = await repos.friendGroupMatches.giverPrintingSupply({
      groupId: trade.groupId,
      giverUserId: trade.giverUserId,
      printingId: trade.printingId,
    });
    const copies = await repos.copies.listMetadataByIds(unreservedCopyIds);
    return toCardTradeCopyOptions({ tradeId: trade.id, quantity: trade.quantity, copies });
  }

  assertGiverUnsettled(trade);
  const pinnedCopyIds = await repos.cardTrades.listReservedCopyIds(tradeId);
  const copies = await listSettleCandidateCopies(repos, trade, pinnedCopyIds);
  return toCardTradeCopyOptions({
    tradeId: trade.id,
    quantity: trade.quantity,
    copies,
    pinnedCopyIds,
  });
}

export function acceptTrade(
  transact: Transact,
  tradeId: string,
  byUserId: string,
  chosenCopyIds?: string[],
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertTradeStatus(trade, "pending", "This trade is no longer pending");
    assertRecipient(trade, role, "accept");

    // Pending offers are not netted out here, unlike in createTrade: this
    // trade's own offer must not block the accept that reserves it.
    const { unreservedCopyIds: copyIds, hasAny } =
      await trxRepos.friendGroupMatches.giverPrintingSupply({
        groupId: trade.groupId,
        giverUserId: trade.giverUserId,
        printingId: trade.printingId,
      });
    if (copyIds.length < trade.quantity) {
      // Exhausted-by-reservation 409s and stays pending; a vanished basis
      // (the giver deleted/unshared the copies) auto-cancels instead.
      if (hasAny) {
        throw tooFewAvailable(copyIds.length);
      }
      await trxRepos.cardTrades.deleteCopiesForTrade(tradeId); // no-op while pending
      await trxRepos.cardTrades.markAutoCancelled(tradeId);
      await autoCancelUnfillablePendingTrades(trxRepos, trade.giverUserId, trade.printingId);
      return reloadDto(trxRepos, tradeId, byUserId);
    }

    // Lock before pinning so a concurrent dispose serializes against this
    // accept; a dispose in the gap leaves fewer survivors, which 409s below.
    const surviving = new Set(await trxRepos.copies.lockByIds(copyIds));
    const lockedCopyIds = copyIds.filter((id) => surviving.has(id));
    if (lockedCopyIds.length < trade.quantity) {
      throw tooFewAvailable(lockedCopyIds.length);
    }

    // Reservations and loan pins live in separate tables, so the lock above
    // can't catch a createLoan racing into the gap before it; re-check here.
    const claimedByLoan = new Set(await trxRepos.loans.filterLoanedCopyIds(lockedCopyIds));
    const availableCopyIds = lockedCopyIds.filter((id) => !claimedByLoan.has(id));
    if (availableCopyIds.length < trade.quantity) {
      throw tooFewAvailable(availableCopyIds.length);
    }

    const pinnedCopyIds = await resolvePinnedCopyIds(
      trxRepos,
      trade,
      role,
      availableCopyIds,
      chosenCopyIds,
    );
    try {
      await trxRepos.cardTrades.pinCopies(tradeId, pinnedCopyIds);
    } catch (error) {
      // A concurrent accept claimed one of these copies first (UNIQUE(copy_id)).
      if (isUniqueViolation(error)) {
        throw tooFewAvailable(Math.max(0, availableCopyIds.length - 1));
      }
      throw error;
    }
    const reserved = await trxRepos.cardTrades.markReserved(tradeId, byUserId);
    if (reserved === 0) {
      // A concurrent decline/cancel moved it out of `pending` after we pinned.
      throw new AppError(409, ERROR_CODES.CONFLICT, "This trade is no longer pending");
    }
    // The pins may have made the giver's other pending trades unfillable.
    await autoCancelUnfillablePendingTrades(trxRepos, trade.giverUserId, trade.printingId);
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}

export function declineTrade(
  transact: Transact,
  tradeId: string,
  byUserId: string,
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertTradeStatus(trade, "pending", "This trade is no longer pending");
    assertRecipient(trade, role, "decline");
    const declined = await trxRepos.cardTrades.markDeclined(tradeId, byUserId);
    if (declined === 0) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "This trade is no longer pending");
    }
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}

export function cancelTrade(
  transact: Transact,
  tradeId: string,
  byUserId: string,
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    if (trade.status === "pending") {
      if (role !== trade.initiator) {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          "Only the initiator can cancel a pending trade",
        );
      }
    } else if (trade.status !== "reserved") {
      throw new AppError(409, ERROR_CODES.CONFLICT, "This trade can no longer be cancelled");
    } else if (trade.giverSyncAppliedAt !== null || trade.receiverSyncAppliedAt !== null) {
      // The giver's settle hard-deletes the copy rows, so cancelling here
      // can't restore them.
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Someone has already settled their side of this trade, so it can no longer be cancelled",
      );
    }
    // Transition first (guarded), so a lost race against complete or another
    // cancel does not delete copies it didn't transition.
    const cancelled = await trxRepos.cardTrades.markCancelled(tradeId, byUserId);
    if (cancelled === 0) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "This trade can no longer be cancelled");
    }
    await trxRepos.cardTrades.deleteCopiesForTrade(tradeId); // no-op while pending
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}

/** `uq_card_trades_live` forbids two live trades per printing; this bumps the existing one. */
export function setTradeQuantity(
  transact: Transact,
  tradeId: string,
  byUserId: string,
  quantity: number,
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    if (quantity < 1) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Quantity must be at least 1");
    }
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertTradeStatus(trade, "pending", "This request can no longer be changed");
    if (role !== trade.initiator) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only the initiator can change this request");
    }

    await assertSupplyAvailable(
      trxRepos,
      trade.groupId,
      trade.giverUserId,
      trade.printingId,
      quantity,
      trade.id,
    );

    // Keep the receiver's wish entry >= the request, or trade-sync's decrement
    // by the trade quantity would go negative.
    if (trade.receiverWishEntryId !== null) {
      await trxRepos.lists.raiseEntryQuantityTo(
        trade.receiverWishEntryId,
        trade.receiverUserId,
        quantity,
      );
    }

    const updated = await trxRepos.cardTrades.setPendingQuantity(tradeId, byUserId, quantity);
    if (updated === 0) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "This request can no longer be changed");
    }
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}

/** `completed` is settleable only for rows predating partial settles; none of those has an unresolved sync. */
function assertSettleable(trade: LiveCardTrade): void {
  if (trade.status !== "reserved" && trade.status !== "completed") {
    throw new AppError(409, ERROR_CODES.CONFLICT, "This trade is no longer open to settle");
  }
}

function assertGiverUnsettled(trade: LiveCardTrade): void {
  assertSettleable(trade);
  if (trade.giverSyncAppliedAt !== null) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "You have already settled your half");
  }
}

/** Written into the receiver's free-text private note; the app never reads it back. */
async function tradeProvenanceNote(trxRepos: Repos, trade: LiveCardTrade): Promise<string | null> {
  const giver = await trxRepos.users.findById(trade.giverUserId);
  const name = giver?.name ?? trade.giverName;
  return name === null || name === undefined || name === ""
    ? null
    : `Traded from ${name} on ${formatDay(new Date())}`;
}

async function applyReceiverSync(
  trxRepos: Repos,
  trade: LiveCardTrade,
  targetCollectionId?: string,
): Promise<void> {
  let collectionId: string;
  if (targetCollectionId === undefined) {
    collectionId = await trxRepos.collections.ensureInbox(trade.receiverUserId);
  } else {
    const writable = await trxRepos.collections.filterWritableByViewer(
      [targetCollectionId],
      trade.receiverUserId,
    );
    if (writable.length !== 1) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "That collection is not writable by you");
    }
    collectionId = targetCollectionId;
  }

  const notesPrivate = await tradeProvenanceNote(trxRepos, trade);
  // Copies have no owner column — ownership derives from the collection; the
  // event below still records receiverUserId as the actor.
  const copyValues = Array.from({ length: trade.quantity }, () => ({
    printingId: trade.printingId,
    collectionId,
    notesPrivate,
  }));
  const copyRows = await trxRepos.copies.insertBatch(copyValues);

  const collectionMeta = await trxRepos.collections.listIdAndNameByIds([collectionId]);
  const collectionName = collectionMeta[0]?.name ?? null;
  await logEvents(
    trxRepos,
    copyRows.map((row) => ({
      userId: trade.receiverUserId,
      action: "added" as const,
      printingId: row.printingId,
      copyId: row.id,
      toCollectionId: row.collectionId,
      toCollectionName: collectionName,
    })),
  );

  // Atomic decrement so a concurrent wishlist edit isn't clobbered; the repo
  // deletes the entry at zero, and a deleted entry is a no-op here.
  if (trade.receiverWishEntryId !== null) {
    await trxRepos.lists.decrementEntryQuantity(
      trade.receiverWishEntryId,
      trade.receiverUserId,
      trade.quantity,
    );
  }
}

/**
 * Safe to substitute copies here: these rows are hard-deleted, not promised,
 * so the swap-in need not have been visible to the group.
 */
async function resolveSettleCopyIds(
  trxRepos: Repos,
  trade: LiveCardTrade,
  quantity: number,
  pinnedCopyIds: string[],
  chosenCopyIds: string[],
): Promise<string[]> {
  const unique = new Set(chosenCopyIds);
  if (unique.size !== chosenCopyIds.length) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "Choose each copy only once");
  }
  if (unique.size !== quantity) {
    const noun = quantity === 1 ? "copy" : "copies";
    throw new AppError(409, ERROR_CODES.CONFLICT, `Choose exactly ${quantity} ${noun}`);
  }

  // Lock only the chosen rows, so a concurrent accept or dispose serializes
  // against this settle without taking rows it never touches.
  const locked = new Set(await trxRepos.copies.lockByIds(chosenCopyIds));
  const candidates = await listSettleCandidateCopies(trxRepos, trade, pinnedCopyIds);
  const allowed = new Set(candidates.map((copy) => copy.id));
  if (chosenCopyIds.some((id) => !locked.has(id) || !allowed.has(id))) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "One of those copies is no longer available");
  }
  return chosenCopyIds;
}

/** The new row is born settled on the caller's side, keeping it outside `uq_card_trades_live`. */
async function splitTradeForSettle(
  trxRepos: Repos,
  trade: LiveCardTrade,
  role: CardTradeRole,
  byUserId: string,
  quantity: number,
  disposingCopyIds?: string[],
): Promise<LiveCardTrade> {
  if ((await trxRepos.cardTrades.reserveQuantityForSplit(trade.id, quantity, role)) === 0) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "You've already resolved your side");
  }
  const split = await trxRepos.cardTrades.createSettledSplit({
    from: trade,
    quantity,
    role,
    lastActorUserId: byUserId,
  });

  // Empty once the giver has settled and released the pins — the normal shape
  // of a receiver splitting after the fact.
  const pinnedCopyIds = await trxRepos.cardTrades.listReservedCopyIds(trade.id);
  if (pinnedCopyIds.length > 0) {
    const pinned = await trxRepos.copies.listMetadataByIds(pinnedCopyIds);
    const plainestFirst = sortCopiesForPinning(pinned).map((copy) => copy.id);
    const moving = selectSplitPins(plainestFirst, quantity, disposingCopyIds);
    await trxRepos.cardTrades.reassignCopies(trade.id, split.id, moving);
  }
  return split;
}

/**
 * A full settle claims its side with a guarded UPDATE; a split's row is born
 * settled and leans on the guarded decrement instead.
 */
async function claimSettleTarget(
  trxRepos: Repos,
  trade: LiveCardTrade,
  role: CardTradeRole,
  byUserId: string,
  quantity: number | undefined,
  disposingCopyIds?: string[],
): Promise<LiveCardTrade> {
  const settling = quantity ?? trade.quantity;
  if (settling > trade.quantity) {
    const noun = trade.quantity === 1 ? "copy" : "copies";
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      `This trade is down to ${trade.quantity} ${noun}`,
    );
  }
  if (settling === trade.quantity) {
    const claimSide = role === "giver" ? claimGiverSyncSide : claimReceiverSyncSide;
    await claimSide(trxRepos, trade.id);
    return trade;
  }
  return splitTradeForSettle(trxRepos, trade, role, byUserId, settling, disposingCopyIds);
}

/**
 * The second settle promotes the trade to `completed`. On a partial settle
 * the returned DTO is the split half, not the remainder.
 */
export function applyTradeSync(
  transact: Transact,
  tradeId: string,
  byUserId: string,
  options: { targetCollectionId?: string; copyIds?: string[]; quantity?: number } = {},
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertSettleable(trade);
    if (options.copyIds !== undefined && role !== "giver") {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "Only the giver can choose which copies to log",
      );
    }

    let settledId: string;
    if (role === "giver") {
      // Read before the claim, since a split needs to know which pins it
      // covers; the claim below is still what makes the dispose run once.
      const pinnedCopyIds = await trxRepos.cardTrades.listReservedCopyIds(tradeId);
      const chosenCopyIds =
        options.copyIds === undefined
          ? undefined
          : await resolveSettleCopyIds(
              trxRepos,
              trade,
              options.quantity ?? trade.quantity,
              pinnedCopyIds,
              options.copyIds,
            );
      const target = await claimSettleTarget(
        trxRepos,
        trade,
        role,
        byUserId,
        options.quantity,
        chosenCopyIds,
      );
      settledId = target.id;
      // Without a choice the pins are what goes; a split moved some of them,
      // so re-read.
      const copyIds =
        chosenCopyIds ??
        (target.id === tradeId
          ? pinnedCopyIds
          : await trxRepos.cardTrades.listReservedCopyIds(target.id));
      // Release first so the dispose guard passes, then dispose through the
      // shared service body so the `removed` event and sweep still happen.
      await trxRepos.cardTrades.deleteCopiesForTrade(target.id);
      if (copyIds.length > 0) {
        await disposeCopiesInTransaction(trxRepos, trade.giverUserId, copyIds, {
          skipReservationGuard: true,
        });
      }
    } else {
      // Claim first, so a concurrent double-apply cannot add the copies
      // twice or double-decrement the wish.
      const target = await claimSettleTarget(trxRepos, trade, role, byUserId, options.quantity);
      settledId = target.id;
      await applyReceiverSync(trxRepos, target, options.targetCollectionId);
    }

    await trxRepos.cardTrades.markCompletedWhenBothSettled(settledId, byUserId);
    return reloadDto(trxRepos, settledId, byUserId);
  });
}

export function skipTradeSync(
  transact: Transact,
  tradeId: string,
  byUserId: string,
  options: { quantity?: number } = {},
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertSettleable(trade);

    const target = await claimSettleTarget(trxRepos, trade, role, byUserId, options.quantity);
    if (role === "giver") {
      // The copy physically left; release the claim so the stale copy reappears
      // as available until the giver fixes their data manually.
      await trxRepos.cardTrades.deleteCopiesForTrade(target.id);
    }

    await trxRepos.cardTrades.markCompletedWhenBothSettled(target.id, byUserId);
    return reloadDto(trxRepos, target.id, byUserId);
  });
}
