import { ERROR_CODES } from "@openrift/shared";
import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared/types";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { sortCopiesForPinning, toCardTradeCopyOptions } from "../lib/card-trade-presenters.js";
import { isUniqueViolation } from "../lib/pg-errors.js";
import { claimCopiesForOffers } from "../lib/trade-offer-claims.js";
import type { CardTrade } from "../repositories/card-trades.js";
import { disposeCopiesInTransaction } from "./copies.js";
import { logEvents } from "./event-logger.js";
import type { TradeEmailDeps } from "./trade-notifications.js";
import { sendTradeRequestEmail } from "./trade-notifications.js";

/** Pending requests expire this long after creation (ADR-019, hard-coded). */
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

/** @returns The viewer's role on a trade, or `null` if they are not a party. */
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

/**
 * Re-reads a trade as a viewer-oriented DTO from inside a transaction. Used to
 * return the updated state right after a mutation.
 * @returns The DTO (must exist; the trade was just read/mutated in this txn).
 */
async function reloadDto(
  repos: Repos,
  tradeId: string,
  userId: string,
): Promise<CardTradeResponse> {
  const dto = await repos.cardTrades.getDtoByIdForUser(tradeId, userId);
  if (dto === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Trade not found");
  }
  return dto;
}

/**
 * Loads a trade and verifies the caller is a party to it. Shared entry point
 * for every mutation below.
 * @returns The trade and the caller's role on it.
 */
async function loadTradeForParty(
  repos: Repos,
  tradeId: string,
  byUserId: string,
): Promise<{ trade: CardTrade; role: CardTradeRole }> {
  const trade = await repos.cardTrades.getById(tradeId);
  if (trade === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Trade not found");
  }
  const role = callerRole(trade, byUserId);
  if (role === null) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "You are not a party to this trade");
  }
  return { trade, role };
}

/** Throws a 409 with `message` unless `trade.status` is `expected`. */
function assertTradeStatus(trade: CardTrade, expected: CardTrade["status"], message: string): void {
  if (trade.status !== expected) {
    throw new AppError(409, ERROR_CODES.CONFLICT, message);
  }
}

/** Throws 403 unless `role` is the recipient, i.e. not the trade's initiator. */
function assertRecipient(trade: CardTrade, role: CardTradeRole, action: string): void {
  if (role === trade.initiator) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, `Only the recipient can ${action} this trade`);
  }
}

/**
 * Caps `quantity` against what the giver can genuinely still hand over: their
 * live unreserved copies of `printingId` in `groupId`, minus whatever their
 * other pending offers have already claimed.
 *
 * Rule-aware (ADR-034): a copy offered only via a dynamic trade rule counts here
 * just as it does in the match view, so callers can't disagree with the dialog's
 * `availableCount`.
 *
 * Offers count against the total because an offer (`initiator = 'giver'`) is a
 * commitment the giver made, and nothing is pinned until the recipient accepts.
 * Each live offer claims specific copy ids out of the group it lives in, oldest
 * offer first (see {@link claimCopiesForOffers}), so a copy shared only with a
 * different group is never falsely counted against this one. This refines
 * ADR-019's "a pending request reserves nothing" rule, which still holds for
 * the request direction: receiver-initiated pending rows are bids and claim no
 * copies, so several members may ask for one card and the giver picks. A
 * knock-on effect is intended: once the only copy is out on an offer, a new
 * request for it also fails here, because the supply really is committed. The
 * match view runs the same claim pass and hides those copies, so this is the
 * backstop for a race rather than the message a member normally sees.
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
 * Reads the giver's unreserved copies of one printing, once per group.
 * Sequential on purpose: the repos may be bound to a single transaction
 * connection, which cannot serve concurrent queries.
 * @returns Group id to the copy ids that group can see.
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
 * Cancels every still-`pending` trade of one giver+printing that the giver's
 * current supply can no longer fill (ADR-019). The threshold is the trade's own
 * `quantity`, not zero: a request for 2 against 1 remaining copy is dead and is
 * closed rather than left to sit out its seven-day TTL.
 *
 * Runs inside the caller's transaction, so the supply drop and the cancellations
 * commit together. Call it from every path where a giver's supply can fall:
 * accepting a competing trade, disposing copies, moving copies, and unsharing a
 * trade list.
 *
 * Ordering, when several pending trades compete for one stack:
 *
 * 1. Offers first, oldest first. An offer (`initiator = 'giver'`) is a
 *    commitment and consumes supply, exactly as in {@link assertSupplyAvailable},
 *    so the copies it holds come off the table before anything else is judged.
 *    Oldest-first lets the first promise survive and keeps the result stable.
 * 2. Requests last, each judged against what the surviving offers left. A
 *    request is a bid, not a commitment (ADR-019), so requests never consume
 *    from each other: several members may still compete for one card and the
 *    giver picks. A request dies only when the supply itself stops covering it.
 *
 * Allocation is by copy id, not by count, so a giver who shares different copies
 * with different groups is not falsely emptied out. An offer in one group only
 * claims copies that group can see. No trade counts against itself: an offer is
 * measured against what the *other* offers left, and claims its own share only
 * if it fits.
 * @returns The ids of the trades that were auto-cancelled.
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

  // One supply read per group these trades span.
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

  // Pass 1: the offers claim their copies, oldest first. This is the same
  // allocation {@link assertSupplyAvailable} runs, so a trade this sweep keeps
  // is exactly one `createTrade` would have allowed.
  const { claimed, unfillable } = claimCopiesForOffers(
    pending.filter((trade) => trade.initiator === "giver"),
    supplyByGroup,
  );
  for (const offer of unfillable) {
    await cancel(offer.id);
  }

  // Pass 2: the requests share whatever is left, competing freely.
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

/** Claims the giver's side of a completed trade's sync (guards a double-apply). */
async function claimGiverSyncSide(repos: Repos, tradeId: string): Promise<void> {
  if ((await repos.cardTrades.setGiverSyncApplied(tradeId)) === 0) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "You've already resolved your side");
  }
}

/** Claims the receiver's side of a completed trade's sync (guards a double-apply). */
async function claimReceiverSyncSide(repos: Repos, tradeId: string): Promise<void> {
  if ((await repos.cardTrades.setReceiverSyncApplied(tradeId)) === 0) {
    throw new AppError(409, ERROR_CODES.CONFLICT, "You've already resolved your side");
  }
}

/**
 * Creates a `pending` trade from a still-valid match. Validates membership, that
 * the match holds (re-running the match repo scoped to the counterparty + printing),
 * the quantity against live supply, and that no live trade already exists.
 * @returns The created trade as a viewer-oriented DTO.
 */
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

  // Re-run the match scoped to the counterparty to confirm it still holds and to
  // snapshot the receiver's wish entry. `receiver` initiates from an "others have
  // your wants" row; `giver` from an "others want your haves" row.
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

  // Live supply nets out reserved copies and the giver's pending offers.
  await assertSupplyAvailable(repos, group.id, giverUserId, printingId, quantity);
  // Never trade more than the wanting side wants — over-trading would over-credit
  // copies and drive the wishlist negative on sync.
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
  let created: CardTrade;
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

  // ADR-030: notify the non-initiator. After commit, outside any transaction,
  // and best-effort (the helper swallows its own errors) so a mail failure can
  // never fail the trade — the bell stays the source of truth.
  if (emailDeps !== undefined) {
    await sendTradeRequestEmail(repos, created, emailDeps);
  }

  return reloadDto(repos, created.id, callerUserId);
}

/**
 * Decides which physical copies an accept promises, out of the candidates that
 * survived the row lock and the loan re-check. Reservations pin copy ids, so
 * this is the choice of what physically leaves the giver's binder (ADR-019).
 *
 * `chosenCopyIds` is the accepting giver's explicit pick. It is honoured only
 * once every id is confirmed to be in `availableCopyIds` — the live supply
 * narrowed by the lock — so an id from another member, from another printing,
 * or from a copy that just went away is refused instead of pinned.
 *
 * Without a pick the plainest copies go first, so a graded, noted or altered
 * copy stays with its owner while a plain one is still on the table.
 * @returns Exactly `trade.quantity` copy ids to pin.
 */
async function resolvePinnedCopyIds(
  trxRepos: Repos,
  trade: CardTrade,
  role: CardTradeRole,
  availableCopyIds: string[],
  chosenCopyIds?: string[],
): Promise<string[]> {
  if (chosenCopyIds === undefined) {
    // Nothing to weigh when the whole stack is going anyway.
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

  // Only the giver owns these copies. On a giver-initiated offer the receiver
  // is the one accepting, and they have no say over which copy they get.
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
 * The physical copies a pending trade could draw on, for the giver's picker.
 * Giver-only: the rows carry the owner's private notes, and the giver is the
 * only party who gets to choose which copy leaves their binder.
 *
 * Reads the same reservable supply the accept path pins from, so the picker can
 * never offer a copy the accept would then refuse.
 * @returns The candidates in default pin order, plus whether to prompt at all.
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
  assertTradeStatus(trade, "pending", "This trade is no longer pending");

  const { unreservedCopyIds } = await repos.friendGroupMatches.giverPrintingSupply({
    groupId: trade.groupId,
    giverUserId: trade.giverUserId,
    printingId: trade.printingId,
  });
  const copies = await repos.copies.listMetadataByIds(unreservedCopyIds);
  return toCardTradeCopyOptions({ tradeId: trade.id, quantity: trade.quantity, copies });
}

/**
 * Accepts a pending trade (recipient only): pins `quantity` unreserved copies and
 * flips to `reserved`.
 *
 * `chosenCopyIds` lets an accepting giver say which physical copies to promise
 * (see {@link resolvePinnedCopyIds}). Omitted, the plainest copies go first.
 * @returns The reserved trade as a viewer-oriented DTO.
 */
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

    // Rule-aware (ADR-034): the reservable supply mirrors the match view, so a
    // copy offered only via a dynamic trade rule is pinnable here. `hasAny` is
    // reservation-agnostic, telling the two exhaustion cases apart below.
    // Pending offers are not netted out here, unlike in createTrade: the pins
    // settle the race, and this trade's own offer must not block the accept
    // that turns it into a reservation.
    const { unreservedCopyIds: copyIds, hasAny } =
      await trxRepos.friendGroupMatches.giverPrintingSupply({
        groupId: trade.groupId,
        giverUserId: trade.giverUserId,
        printingId: trade.printingId,
      });
    if (copyIds.length < trade.quantity) {
      // Tell apart a stack merely exhausted by competing reservations (the copies
      // still exist, so the request stays pending and 409s) from a vanished basis
      // — the giver deleted/unshared the copies — which auto-cancels (ADR-019).
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

    // Lock the candidate copies before pinning so a concurrent dispose of one of
    // them serializes against this accept (audit #7); the survivors are the ids
    // that still exist under the lock. If a dispose deleted one in the gap we
    // now have too few — 409 rather than an FK violation on a vanished copy.
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

    // Which of the survivors actually gets promised — the giver's own pick when
    // they sent one, otherwise the plainest copies.
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

/**
 * Declines a pending trade (recipient only).
 * @returns The declined trade as a viewer-oriented DTO.
 */
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

/**
 * Cancels a trade. The initiator may cancel while `pending`; either party may
 * cancel while `reserved` (releasing the reserved copies).
 * @returns The cancelled trade as a viewer-oriented DTO.
 */
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
      // One side has already settled. The giver's settle hard-deletes the copy
      // rows, so cancelling cannot put back the copy, its id, or its condition,
      // grade and notes — it would only record a lie about a swap that half
      // happened (ADR-019, amendment 2026-08-10).
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Someone has already settled their side of this trade, so it can no longer be cancelled",
      );
    }
    // Transition first (guarded), so a lost race against complete/another cancel
    // does not delete copies it didn't transition.
    const cancelled = await trxRepos.cardTrades.markCancelled(tradeId, byUserId);
    if (cancelled === 0) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "This trade can no longer be cancelled");
    }
    // Release any reserved copies (no-op while pending).
    await trxRepos.cardTrades.deleteCopiesForTrade(tradeId);
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}

/**
 * Resizes a still-pending request to a new total quantity (initiator only). Used
 * by per-copy claiming on a member's tradelist: claiming/releasing a copy bumps
 * the single live trade up or down rather than opening a second one (the unique
 * index `uq_card_trades_live` forbids two live trades per printing). Validates
 * the new quantity against live supply, and raises the linked wish entry so the
 * trade never wants more than the wishlist asks for (sync would otherwise drive
 * it negative). A quantity of 0 is not allowed here — release the last copy via
 * {@link cancelTrade} instead.
 * @returns The resized trade as a viewer-oriented DTO.
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

    // Cap by the giver's live (unreserved) supply, mirroring createTrade. This
    // trade is excluded from the committed-offer sum: a pending offer being
    // resized must not count against itself.
    await assertSupplyAvailable(
      trxRepos,
      trade.groupId,
      trade.giverUserId,
      trade.printingId,
      quantity,
      trade.id,
    );

    // Keep the receiver's wish entry ≥ the request: claiming a copy is an explicit
    // "I want this one too", and trade-sync decrements the wish by the trade
    // quantity, so a smaller wish would go negative. Receiver-initiated requests
    // always carry the entry; the guard keeps the giver-offer path safe. Done as
    // an atomic GREATEST so a concurrent wishlist edit isn't clobbered (audit #3).
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
 * Guards the caller into settling their own half of a swap, and promotes the
 * trade once both halves are in.
 *
 * A settle is legal from `reserved` (the normal path) and from `completed`,
 * which only rows predating the 2026-08-10 amendment can still be in: the
 * migration revived every completed row with an unresolved sync, so what is
 * left is a fully-resolved row whose `claim*SyncSide` will match zero and 409.
 * @returns Nothing.
 */
function assertSettleable(trade: CardTrade): void {
  if (trade.status !== "reserved" && trade.status !== "completed") {
    throw new AppError(409, ERROR_CODES.CONFLICT, "This trade is no longer open to settle");
  }
}

/** Adds `quantity` copies of the trade's printing for the receiver and decrements their wish. */
async function applyReceiverSync(
  trxRepos: Repos,
  trade: CardTrade,
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

  // Copies have no owner column — ownership derives from the collection (the
  // event below still records receiverUserId as the actor). Matches addCopies.
  const copyValues = Array.from({ length: trade.quantity }, () => ({
    printingId: trade.printingId,
    collectionId,
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
  // edit isn't clobbered (audit #2); the repo deletes it when it hits zero. A
  // deleted entry (FK SET NULL leaves receiverWishEntryId, or the row is gone)
  // matches nothing and is a no-op.
  if (trade.receiverWishEntryId !== null) {
    await trxRepos.lists.decrementEntryQuantity(
      trade.receiverWishEntryId,
      trade.receiverUserId,
      trade.quantity,
    );
  }
}

/**
 * Settles the caller's own half of a swap, with the data change. Giver: dispose
 * the reserved copies (releasing the reservation first, atomically), which is
 * "I handed them over". Receiver: add the copies and decrement the wish entry,
 * which is "I got them".
 *
 * Each side asserts only its own half, so nothing here claims the swap happened
 * for the other party. The second settle promotes the trade to `completed`.
 * @returns The trade as a viewer-oriented DTO.
 */
export function applyTradeSync(
  transact: Transact,
  tradeId: string,
  byUserId: string,
  targetCollectionId?: string,
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertSettleable(trade);

    if (role === "giver") {
      // Claim the giver's side first (guarded UPDATE): a concurrent double-apply
      // matches zero rows here and 409s, so the dispose below runs exactly once.
      await claimGiverSyncSide(trxRepos, tradeId);
      const copyIds = await trxRepos.cardTrades.listReservedCopyIds(tradeId);
      // Release the reservation rows so the dispose guard passes, then dispose
      // through the shared service body (emits a `removed` event and
      // cascade-removes the copies' copy-kind tradelist entries).
      await trxRepos.cardTrades.deleteCopiesForTrade(tradeId);
      if (copyIds.length > 0) {
        await disposeCopiesInTransaction(trxRepos, trade.giverUserId, copyIds, {
          skipReservationGuard: true,
        });
      }
    } else {
      // Claim the receiver's side first, so a concurrent double-apply cannot add
      // the copies twice or double-decrement the wish.
      await claimReceiverSyncSide(trxRepos, tradeId);
      await applyReceiverSync(trxRepos, trade, targetCollectionId);
    }

    await trxRepos.cardTrades.markCompletedWhenBothSettled(tradeId, byUserId);
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}

/**
 * Settles the caller's own half without the data change: the swap happened, but
 * leave my collection alone. Covers the giver who already removed the card by
 * hand and anyone who doesn't track their collection closely.
 *
 * The giver's skip still releases the reservation — the copy physically left,
 * so the stale copy reappears as available until they fix it manually.
 * @returns The trade as a viewer-oriented DTO.
 */
export function skipTradeSync(
  transact: Transact,
  tradeId: string,
  byUserId: string,
): Promise<CardTradeResponse> {
  return transact(async (trxRepos) => {
    const { trade, role } = await loadTradeForParty(trxRepos, tradeId, byUserId);
    assertSettleable(trade);

    if (role === "giver") {
      await claimGiverSyncSide(trxRepos, tradeId);
      // The copy physically left; release the claim so the stale copy reappears
      // as available until the giver fixes their data manually.
      await trxRepos.cardTrades.deleteCopiesForTrade(tradeId);
    } else {
      await claimReceiverSyncSide(trxRepos, tradeId);
    }

    await trxRepos.cardTrades.markCompletedWhenBothSettled(tradeId, byUserId);
    return reloadDto(trxRepos, tradeId, byUserId);
  });
}
