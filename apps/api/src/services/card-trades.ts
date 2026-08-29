import { ERROR_CODES, formatDay } from "@openrift/shared";
import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared/types";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { TradeCopyRow } from "../lib/card-trade-presenters.js";
import {
  selectSplitPins,
  sortCopiesForPinning,
  toCardTradeCopyOptions,
  toCardTradeResponse,
} from "../lib/card-trade-presenters.js";
import { isUniqueViolation } from "../lib/pg-errors.js";
import { claimCopiesForOffers } from "../lib/trade-offer-claims.js";
import type { CardTrade, LiveCardTrade } from "../repositories/card-trades.js";
import { disposeCopiesInTransaction } from "./copies.js";
import { logEvents } from "./event-logger.js";
import type { TradeEmailDeps } from "./trade-notifications.js";
import { sendTradeRequestEmail } from "./trade-notifications.js";

const PENDING_TTL_HOURS = 24 * 7;

export interface CreateTradeInput {
  callerUserId: string;
  groupSlug: string;
  counterpartyUserId: string;
  /** The caller's side: `receiver` = "I want this" request, `giver` = "I have this" offer. */
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
 * Deleting an account or a friend group nulls the id it owned on every trade
 * it touched and cancels the live ones in the same trigger, so a trade missing
 * any of the three is finished history: nothing is left to act on, and the
 * other party sees it read-only through the DTO surfaces.
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
 * Offers (`initiator = 'giver'`) count against supply — a commitment with
 * nothing pinned until the recipient accepts — while requests are bids and
 * claim nothing, so several members may ask for one card and the giver picks.
 * Allocation is by copy id per group ({@link claimCopiesForOffers}), so a copy
 * shared only with a different group is never falsely counted against this
 * one. The knock-on is intended: once the only copy is out on an offer, a new
 * request also fails here, because the supply really is committed.
 *
 * `excludeTradeId` drops the trade being resized from the claim pass, so a
 * pending offer does not compete with itself in {@link setTradeQuantity}.
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

/**
 * Sequential on purpose: the repos may be bound to a single transaction
 * connection, which cannot serve concurrent queries.
 */
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
 * The threshold is the trade's own `quantity`, not zero: a request for 2
 * against 1 remaining copy is dead and is closed rather than left to sit out
 * its TTL. Runs inside the caller's transaction so the supply drop and the
 * cancellations commit together — call it from every path where a giver's
 * supply can fall: accepting a competing trade, disposing copies, moving
 * copies, and unsharing a trade list.
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

  // Re-run the match to confirm it still holds and to snapshot the receiver's
  // wish entry. `receiver` initiates from an "others have your wants" row;
  // `giver` from an "others want your haves" row.
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
  const printingMatches = matchRows.filter((row) => row.printingId === printingId);
  if (printingMatches.length === 0) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "That card is no longer available to trade");
  }
  const {
    buyEntryId: receiverWishEntryId,
    cardId,
    buyQuantity: demandQuantity,
  } = printingMatches[0];

  // Checked before supply: a second offer to the same person would otherwise
  // fail the supply check (its own pending offer holds the copy) and report
  // phantom exhaustion instead of the duplicate.
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
 * Without an explicit pick the plainest copies go first, so a graded, noted or
 * altered copy stays with its owner while a plain one is still on the table. A
 * pick is honoured only once every id is confirmed to be in
 * `availableCopyIds`, so an id from another member, another printing, or a
 * copy that just went away is refused instead of pinned.
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
 * Deliberately wider than the accept path's candidate set. That one is scoped
 * to what the group can see, because a pin promises a copy into a live trade;
 * this one runs after the cards physically changed hands and records which
 * copy left — routinely one the group never saw, which is the whole reason the
 * giver is correcting the pick.
 */
async function listSettleCandidateCopies(
  repos: Repos,
  trade: LiveCardTrade,
  pinnedCopyIds: readonly string[],
): Promise<TradeCopyRow[]> {
  // Sequential: transaction-bound repos share one connection.
  // `listFreePersonalMetadataForPrinting` excludes every trade-pinned copy, so
  // the two reads cannot overlap.
  const pinned = await repos.copies.listMetadataByIds(pinnedCopyIds);
  const free = await repos.copies.listFreePersonalMetadataForPrinting(
    trade.giverUserId,
    trade.printingId,
  );
  return [...pinned, ...free];
}

/**
 * Giver-only because the rows carry the owner's private notes. The pending
 * branch reads the same reservable supply the accept path pins from, so the
 * picker can never offer a copy the accept would then refuse.
 */
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

    // Pending offers are not netted out here, unlike in createTrade: the pins
    // settle the race, and this trade's own offer must not block the accept
    // that turns it into a reservation. `hasAny` is reservation-agnostic,
    // telling the two exhaustion cases apart below.
    const { unreservedCopyIds: copyIds, hasAny } =
      await trxRepos.friendGroupMatches.giverPrintingSupply({
        groupId: trade.groupId,
        giverUserId: trade.giverUserId,
        printingId: trade.printingId,
      });
    if (copyIds.length < trade.quantity) {
      // A stack merely exhausted by competing reservations stays pending and
      // 409s; a vanished basis (the giver deleted/unshared the copies)
      // auto-cancels.
      if (hasAny) {
        throw tooFewAvailable(copyIds.length);
      }
      await trxRepos.cardTrades.deleteCopiesForTrade(tradeId); // no-op while pending
      await trxRepos.cardTrades.markAutoCancelled(tradeId);
      // The basis vanished for everyone, not just this trade. Close the
      // giver's other pending trades for the printing in the same breath.
      await autoCancelUnfillablePendingTrades(trxRepos, trade.giverUserId, trade.printingId);
      return reloadDto(trxRepos, tradeId, byUserId);
    }

    // Lock the candidate copies before pinning so a concurrent dispose of one
    // of them serializes against this accept; the survivors are the ids that
    // still exist under the lock. If a dispose deleted one in the gap we now
    // have too few — 409 rather than an FK violation on a vanished copy.
    const surviving = new Set(await trxRepos.copies.lockByIds(copyIds));
    const lockedCopyIds = copyIds.filter((id) => surviving.has(id));
    if (lockedCopyIds.length < trade.quantity) {
      throw tooFewAvailable(lockedCopyIds.length);
    }

    // `giverPrintingSupply` excluded loaned copies before the lock, but a
    // concurrent createLoan can pin one of these ids in the gap between that
    // read and the lock above — the reservable-supply check and loan pins live
    // in separate tables, so `copies.lockByIds` alone can't catch it (the
    // pinCopies unique-violation catch below only guards against another
    // accept). Re-check the loan side now that the rows are locked.
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
    // The pins just took these copies out of the reservable supply, so the
    // giver's competing pending trades may have become unfillable. Close them
    // now instead of letting them sit until the TTL, 409-ing on every accept.
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
      // The giver's settle hard-deletes the copy rows, so cancelling cannot
      // put back the copy, its id, or its condition, grade and notes — it
      // would only record a lie about a swap that half happened.
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

/**
 * Per-copy claiming bumps the single live trade up or down rather than opening
 * a second one: `uq_card_trades_live` forbids two live trades per printing. A
 * quantity of 0 is not allowed here — release the last copy via
 * {@link cancelTrade} instead.
 */
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

    // Keep the receiver's wish entry ≥ the request: trade-sync decrements the
    // wish by the trade quantity, so a smaller wish would go negative. Done as
    // an atomic GREATEST so a concurrent wishlist edit isn't clobbered.
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

/**
 * `completed` is allowed only for rows that finished before partial settles
 * existed: the migration revived every completed row with an unresolved sync,
 * so what is left is fully resolved and its `claim*SyncSide` will match zero
 * and 409.
 */
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

/**
 * Where a traded-in copy came from, seeded into the receiver's private note.
 *
 * Deliberately the free-text note rather than a column: it is the owner's own
 * field, so they can reword it, add a price they paid alongside, or clear it
 * entirely. The app never reads it back, which is what keeps that safe.
 * @returns The note, or null when the giver's name is not available.
 */
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

  // Decrement the snapshotted wish entry atomically so a concurrent wishlist
  // edit isn't clobbered; the repo deletes it when it hits zero. A deleted
  // entry matches nothing and is a no-op.
  if (trade.receiverWishEntryId !== null) {
    await trxRepos.lists.decrementEntryQuantity(
      trade.receiverWishEntryId,
      trade.receiverUserId,
      trade.quantity,
    );
  }
}

/**
 * Substituting copies is safe here where re-pinning would not be: these rows
 * are about to be hard-deleted, not promised, so the swapped-in copy never
 * needs to have been visible to the group. On a partial settle `quantity` is
 * the split half's, not the whole row's.
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

  // Lock the chosen rows before reading the candidate set, so a concurrent
  // accept or dispose serializes against this settle and the read below sees
  // what that transaction committed. Locking the whole candidate set instead
  // would take rows this settle never touches.
  const locked = new Set(await trxRepos.copies.lockByIds(chosenCopyIds));
  const candidates = await listSettleCandidateCopies(trxRepos, trade, pinnedCopyIds);
  const allowed = new Set(candidates.map((copy) => copy.id));
  if (chosenCopyIds.some((id) => !locked.has(id) || !allowed.has(id))) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "One of those copies is no longer available");
  }
  return chosenCopyIds;
}

/**
 * The remainder stays in flight with the rest of the quantity and pins, so
 * "they'll bring the other two next time" needs no state of its own.
 *
 * The guarded decrement is the entire concurrency story: it takes the row
 * lock, refuses a caller whose side is already settled, and refuses a quantity
 * that would leave no remainder — two racing partial settles serialize on it
 * and the loser 409s instead of driving the quantity negative. The insert that
 * follows is born settled on the caller's side, which keeps the new row
 * outside `uq_card_trades_live` while the original holds the live slot.
 */
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
 * The two paths guard a double-apply differently and both have to: a full
 * settle claims its side with a guarded UPDATE, while a split's row is born
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
 * Each side settles only its own half — the giver's dispose is "I handed them
 * over", the receiver's add is "I got them" — so nothing here claims the swap
 * happened for the other party. The second settle promotes the trade to
 * `completed`. On a partial settle the returned DTO is the split half, not the
 * remainder.
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
      // Resolved before the claim, because a split has to know which pins
      // cover the copies it disposes. Nothing is written yet: the claim below
      // is still what makes the dispose run exactly once.
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
      let copyIds = chosenCopyIds;
      if (copyIds === undefined) {
        copyIds =
          target.id === tradeId
            ? pinnedCopyIds
            : await trxRepos.cardTrades.listReservedCopyIds(target.id);
      }
      // Release the reservation rows so the dispose guard passes, then dispose
      // through the shared service body so the `removed` event and the
      // unfillable-trade sweep still happen.
      await trxRepos.cardTrades.deleteCopiesForTrade(target.id);
      if (copyIds.length > 0) {
        await disposeCopiesInTransaction(trxRepos, trade.giverUserId, copyIds, {
          skipReservationGuard: true,
        });
      }
    } else {
      // Claim first, so a concurrent double-apply cannot add the copies twice
      // or double-decrement the wish. The split half carries its own quantity
      // and the same wish entry, so the two halves' decrements sum to the
      // original's.
      const target = await claimSettleTarget(trxRepos, trade, role, byUserId, options.quantity);
      settledId = target.id;
      await applyReceiverSync(trxRepos, target, options.targetCollectionId);
    }

    await trxRepos.cardTrades.markCompletedWhenBothSettled(settledId, byUserId);
    return reloadDto(trxRepos, settledId, byUserId);
  });
}

/**
 * "The swap happened, but leave my collection alone" — covers the giver who
 * already removed the card by hand and anyone who doesn't track closely. A
 * partial skip is also how a receiver closes a remainder that never arrived
 * once cancel is past.
 */
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
