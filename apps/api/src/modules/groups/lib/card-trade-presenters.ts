import { cardTradeLivePhaseRank } from "@openrift/shared/card-trade-lifecycle";
import { copyHasMetadata, copyMetadataWeight } from "@openrift/shared/copy-metadata";
import type {
  CardTradeActionNeeded,
  CardTradeCopyOption,
  CardTradeCopyOptionsResponse,
  CardTradeCounterparty,
  CardTradeInitiator,
  CardTradeLiveAnnotation,
  CardTradeLiveByPrintingResponse,
  CardTradeResponse,
  CardTradeRole,
  CardTradeSheetGroup,
  CardTradeSheetMatchRow,
  CardTradeStatus,
} from "@openrift/shared/types/api/card-trade";
import type { CopyLink } from "@openrift/shared/types/api/collection";
import type { ContactMethod } from "@openrift/shared/types/api/contact-method";

import { gravatarHashForEmail } from "../../../lib/gravatar.js";
import type { LiveTradeAnnotationRow } from "../repositories/card-trades-reads.js";
import type { CardTradeDtoRow } from "../repositories/card-trades-shared.js";
import type { MatchRow } from "../repositories/friend-group-matches-view.js";

/**
 * One candidate copy behind a trade, as `copies.listMetadataByIds` reads it.
 * Every candidate is the same printing. On a pending trade they all come from
 * the giver's reservable supply, so none is reserved or out on a loan; on a
 * reserved one the copies pinned to that trade are candidates too.
 */
export interface TradeCopyRow {
  id: string;
  collectionId: string;
  collectionName: string;
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  notesPrivate: string | null;
  isAltered: boolean;
  links: CopyLink[];
}

/**
 * Weighs by `copyMetadataWeight`, shared with the web app's
 * `apps/web/src/lib/move-sources.ts`, so a default pin and a default move pick the same copy.
 */
export function sortCopiesForPinning(copies: readonly TradeCopyRow[]): TradeCopyRow[] {
  return copies.toSorted(
    (a, b) =>
      copyMetadataWeight(a) - copyMetadataWeight(b) ||
      a.collectionName.localeCompare(b.collectionName) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Which of a trade's pins move onto the half a partial settle splits off.
 *
 * `disposingCopyIds` is the giver's settle set, and any pin covering one of
 * those has to be in the answer: the copy is about to be hard-deleted, and
 * `card_trade_copies.copy_id` cascades, so a pin left behind on the remainder
 * would vanish with it and quietly leave the remainder short. Those go first,
 * then the count is filled from the rest in the order given, which the caller
 * has already put plainest-first. That ordering is the whole rule on the
 * receiver's side, where nothing is being disposed and the receiver has no say
 * over which of the giver's copies left.
 */
export function selectSplitPins(
  pinnedPlainestFirst: readonly string[],
  quantity: number,
  disposingCopyIds: readonly string[] = [],
): string[] {
  const disposing = new Set(disposingCopyIds);
  const leaving = pinnedPlainestFirst.filter((copyId) => disposing.has(copyId));
  const staying = pinnedPlainestFirst.filter((copyId) => !disposing.has(copyId));
  return [...leaving, ...staying].slice(0, quantity);
}

/**
 * A copy's identity as a person would judge it. Two candidates with the same
 * key are interchangeable, so asking which one to promise is busywork.
 *
 * `byCollection` adds the binder the copy is filed in to that identity. The
 * settle picker sets it: the copies are about to be deleted, so which binder
 * loses one is part of the answer, and the giver said so. The accept picker
 * does not, because a promise is not a deletion — two plain copies in two
 * binders are the same card to promise away, and counting that as a difference
 * would fire the picker on nearly every trade.
 *
 * Printing-level traits (finish, art variant, language) are out of the key for
 * a stronger reason: a trade names one printing, so every candidate shares them.
 */
function distinguishingKey(copy: TradeCopyRow, byCollection: boolean): string {
  return JSON.stringify([
    byCollection ? copy.collectionId : null,
    copy.condition,
    copy.grader,
    copy.grade,
    copy.isAltered,
    copy.notesPublic,
    copy.notesPrivate,
    copy.links.map((link) => [link.url, link.label ?? null]),
  ]);
}

export function cardTradeChoiceMatters(
  copies: readonly TradeCopyRow[],
  quantity: number,
  byCollection = false,
): boolean {
  if (copies.length <= quantity) {
    return false;
  }
  const keys = new Set(copies.map((copy) => distinguishingKey(copy, byCollection)));
  return keys.size > 1;
}

export function toCardTradeCopyOption(copy: TradeCopyRow, pinned: boolean): CardTradeCopyOption {
  return {
    id: copy.id,
    collectionId: copy.collectionId,
    collectionName: copy.collectionName,
    pinned,
    condition: copy.condition,
    grader: copy.grader,
    grade: copy.grade,
    notesPublic: copy.notesPublic,
    notesPrivate: copy.notesPrivate,
    isAltered: copy.isAltered,
    links: copy.links,
    hasRecordedDetails: copyHasMetadata(copy),
  };
}

/**
 * Maps a trade's candidate copies to the giver-facing options payload.
 *
 * With no `pinnedCopyIds` (the pending/accept case) `copies` comes back in
 * default pin order, so `copies.slice(0, quantity)` is what an accept without
 * an explicit choice would promise. On a reserved trade the pinned copies sort
 * ahead of the rest, since they are the current answer the settle picker opens
 * on; the alternatives keep the plainest-first order behind them.
 *
 * Passing `pinnedCopyIds` is also what marks this as the settle side, which
 * judges "these copies are alike" per collection (see
 * {@link distinguishingKey}).
 */
export function toCardTradeCopyOptions(input: {
  tradeId: string;
  quantity: number;
  copies: readonly TradeCopyRow[];
  pinnedCopyIds?: readonly string[];
}): CardTradeCopyOptionsResponse {
  const settling = input.pinnedCopyIds !== undefined;
  const pinned = new Set(input.pinnedCopyIds);
  const byPinWeight = sortCopiesForPinning(input.copies);
  const ordered = [
    ...byPinWeight.filter((copy) => pinned.has(copy.id)),
    ...byPinWeight.filter((copy) => !pinned.has(copy.id)),
  ];
  return {
    tradeId: input.tradeId,
    quantity: input.quantity,
    choiceMatters: cardTradeChoiceMatters(ordered, input.quantity, settling),
    copies: ordered.map((copy) => toCardTradeCopyOption(copy, pinned.has(copy.id))),
  };
}

/** Roles in their response order: the viewer's own copies first. */
const LIVE_ROLE_ORDER: readonly CardTradeRole[] = ["giver", "receiver"];

/**
 * Maps one aggregated bucket to its response shape. The counts arrive as
 * integers from the grouped query, but a `count(*)` that reached the driver as
 * a bigint string would silently serialize as one, so both go through `Number`.
 */
export function toCardTradeLiveAnnotation(row: LiveTradeAnnotationRow): CardTradeLiveAnnotation {
  return {
    printingId: row.printingId,
    role: row.role,
    phase: row.phase,
    tradeCount: Number(row.tradeCount),
    quantity: Number(row.quantity),
  };
}

/**
 * Maps the viewer's aggregated live trades to the annotations payload. The
 * grouped query has no meaningful order of its own, so the order is imposed
 * here: printing, then the viewer's own copies before cards coming to them,
 * then most committed first. A client that renders the list as-is gets a stable
 * result, and one that takes the first entry per (printing, role) gets the
 * phase that matters most.
 */
export function toCardTradeLiveByPrinting(
  rows: readonly LiveTradeAnnotationRow[],
): CardTradeLiveByPrintingResponse {
  const ordered = rows.toSorted(
    (a, b) =>
      a.printingId.localeCompare(b.printingId) ||
      LIVE_ROLE_ORDER.indexOf(a.role) - LIVE_ROLE_ORDER.indexOf(b.role) ||
      cardTradeLivePhaseRank(b.phase) - cardTradeLivePhaseRank(a.phase),
  );
  return { annotations: ordered.map((row) => toCardTradeLiveAnnotation(row)) };
}

/**
 * The other party as a caller can supply them: a group member read from the
 * roster, or a trade row's counterparty columns. Everything is nullable because
 * a deleted account leaves nothing but the name snapshotted on the trade.
 */
export interface TradeCounterpartyRow {
  userId: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** One shared group's match rows, in the order the groups are presented. */
export interface TradeSheetGroupRows {
  group: CardTradeSheetGroup;
  rows: readonly MatchRow[];
}

/**
 * The counterparty header of a person-level trade sheet.
 *
 * Contacts are revealed per group, so a person the viewer meets in two groups
 * can have revealed a phone number in one and a Discord handle in the other.
 * The sheet is one view of that person, so the lists are unioned — the viewer
 * is a member of every group in `contactMethodsByGroup` and is entitled to each
 * of them. Ids repeat when the same method is revealed twice, so the union
 * dedupes on id and keeps each method's first appearance, which preserves the
 * owner's sort order within a group.
 */
export function toCardTradeCounterparty(
  member: TradeCounterpartyRow,
  contactMethodsByGroup: readonly (readonly ContactMethod[] | undefined)[],
): CardTradeCounterparty {
  const seen = new Set<string>();
  const contactMethods: ContactMethod[] = [];
  for (const methods of contactMethodsByGroup) {
    for (const method of methods ?? []) {
      if (!seen.has(method.id)) {
        seen.add(method.id);
        contactMethods.push(method);
      }
    }
  }
  return {
    userId: member.userId,
    name: member.name,
    image: member.image,
    // A deleted account leaves no address; the hash of the empty string is
    // stable and Gravatar answers it with its placeholder avatar.
    gravatarHash: gravatarHashForEmail(member.email ?? ""),
    contactMethods,
  };
}

/**
 * What makes two pooled match rows the same offer. A copy the counterparty
 * shares with two groups matches the viewer's demand once per group, and the
 * sheet is about the person, not the group, so those collapse into one row.
 *
 * The buy side is in the key because the same copy can answer two different
 * wants (a card-level entry and a printing-level one, or two wishlists), and
 * those really are separate rows. `buyEntryId` is null for demand a dynamic
 * rule produced, which is a value of its own here: a rule-derived row and a
 * manual row on the same list are not the same row.
 */
function sheetRowKey(row: MatchRow): string {
  return JSON.stringify([row.copyId, row.buyListId, row.buyEntryId]);
}

/**
 * Pools one direction's match rows across the shared groups, tagging each with
 * the group whose shares produced it and dropping the repeats.
 *
 * Direction is not part of the dedupe key because it never has to be: each
 * direction is pooled by its own call, and a copy the viewer owns cannot also
 * be a copy the counterparty owns. Groups are visited in the order given (the
 * response's group order, by name), so a row present in several shared groups
 * is attributed to the first of them — a stable answer that does not move when
 * an unrelated group's shares change.
 */
export function toCardTradeSheetRows(
  perGroup: readonly TradeSheetGroupRows[],
): CardTradeSheetMatchRow[] {
  const seen = new Set<string>();
  const pooled: CardTradeSheetMatchRow[] = [];
  for (const { group, rows } of perGroup) {
    for (const row of rows) {
      const key = sheetRowKey(row);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      pooled.push({ ...row, groupId: group.id, groupSlug: group.slug });
    }
  }
  return pooled;
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function deriveActionNeeded(
  status: CardTradeStatus,
  role: CardTradeRole,
  initiator: CardTradeInitiator,
  viewerSyncAppliedAt: Date | null,
): CardTradeActionNeeded | null {
  if (status === "pending") {
    return role === initiator ? "cancel" : "accept-or-decline";
  }
  // One action covers both the physical claim and its data change: the viewer
  // settles their own half ("handed over" / "got them"), and the second settle
  // promotes the trade. A side that has already settled has nothing left to do
  // and waits on the other party.
  if (status === "reserved") {
    return viewerSyncAppliedAt === null ? "settle" : null;
  }
  // Only legacy rows that finished before partial settles existed can be
  // `completed` with a side still outstanding; they keep their settle action.
  if (status === "completed") {
    return viewerSyncAppliedAt === null ? "settle" : null;
  }
  return null;
}

/**
 * Orients a trade row to one viewer: which side they are on, who the other
 * party is, and what the trade is waiting on from them.
 *
 * The row's contacts are already scoped to the counterparty and the trade's
 * group, so they go through the one counterparty builder as a single group.
 */
export function toCardTradeResponse(row: CardTradeDtoRow, userId: string): CardTradeResponse {
  const viewerIsGiver = row.giverUserId === userId;
  const role: CardTradeRole = viewerIsGiver ? "giver" : "receiver";

  const counterpartyRow: TradeCounterpartyRow = viewerIsGiver
    ? {
        userId: row.receiverUserId,
        name: row.receiverName ?? row.receiverSnapshotName,
        email: row.receiverEmail,
        image: row.receiverImage,
      }
    : {
        userId: row.giverUserId,
        name: row.giverName ?? row.giverSnapshotName,
        email: row.giverEmail,
        image: row.giverImage,
      };

  const viewerSyncAppliedAt = viewerIsGiver ? row.giverSyncAppliedAt : row.receiverSyncAppliedAt;
  const counterpartySyncAppliedAt = viewerIsGiver
    ? row.receiverSyncAppliedAt
    : row.giverSyncAppliedAt;

  return {
    id: row.id,
    groupId: row.groupId,
    groupSlug: row.groupSlug,
    // `chk_card_trades_group_shape` guarantees one of these is set; the "" fallback
    // is unreachable and exists only so a corrupt row renders an unlabelled chip.
    groupName: row.groupLiveName ?? row.groupSnapshotName ?? "",
    role,
    initiator: row.initiator,
    counterparty: toCardTradeCounterparty(counterpartyRow, [row.counterpartyContacts]),
    printingId: row.printingId,
    cardId: row.cardId,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    acceptedAt: isoOrNull(row.acceptedAt),
    completedAt: isoOrNull(row.completedAt),
    closedAt: isoOrNull(row.closedAt),
    expiresAt: isoOrNull(row.expiresAt),
    viewerSyncAppliedAt: isoOrNull(viewerSyncAppliedAt),
    counterpartySyncAppliedAt: isoOrNull(counterpartySyncAppliedAt),
    actionNeeded: deriveActionNeeded(row.status, role, row.initiator, viewerSyncAppliedAt),
  };
}
