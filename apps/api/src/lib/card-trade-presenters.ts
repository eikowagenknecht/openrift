import type { ContactMethod, CopyLink } from "@openrift/shared";
import type {
  CardTradeCopyOption,
  CardTradeCopyOptionsResponse,
  CardTradeCounterparty,
  CardTradeLiveAnnotation,
  CardTradeLiveByPrintingResponse,
  CardTradeLivePhase,
  CardTradeRole,
  CardTradeSheetGroup,
  CardTradeSheetMatchRow,
} from "@openrift/shared/types";

import type { LiveTradeAnnotationRow } from "../repositories/card-trades.js";
import type { MatchRow } from "../repositories/friend-group-matches.js";
import { gravatarHashForEmail } from "./gravatar.js";

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
 * How much metadata a copy carries. The accept path pins the plainest copy
 * first, so a graded, noted or altered copy stays with its owner while a plain
 * one is still available. Mirrors `metadataWeight` in the web app's move
 * palette (`apps/web/src/lib/move-sources.ts`) so a default pin and a default
 * move reach for the same copy. That function's loan term is absent here: a
 * loaned copy never enters the trade supply in the first place.
 * @returns The weight; lower means plainer.
 */
export function copyPinWeight(copy: TradeCopyRow): number {
  let weight = 0;
  if (copy.condition !== null) {
    weight += 1;
  }
  if (copy.grader !== null || copy.grade !== null) {
    weight += 2;
  }
  if (copy.notesPublic !== null) {
    weight += 2;
  }
  if (copy.notesPrivate !== null) {
    weight += 2;
  }
  if (copy.isAltered) {
    weight += 2;
  }
  if (copy.links.length > 0) {
    weight += 2;
  }
  return weight;
}

/**
 * Orders candidates plainest-first, then by collection name, id as the final
 * tiebreak. The first `quantity` entries are what an accept without an explicit
 * choice pins.
 *
 * The collection term is what the picker reads as grouping: six equally plain
 * copies spread over two binders would otherwise interleave in id order, which
 * is effectively random to the giver scanning the list. It also decides the
 * default pin among copies that are alike in every other way, which lands on
 * the alphabetically first collection. That is arbitrary but stable, and a
 * stable answer is the point: the accept picker does not even open for copies
 * that differ only by collection, so nobody is being asked to ratify it.
 * @returns A new array in default pin order.
 */
export function sortCopiesForPinning(copies: readonly TradeCopyRow[]): TradeCopyRow[] {
  return copies.toSorted(
    (a, b) =>
      copyPinWeight(a) - copyPinWeight(b) ||
      a.collectionName.localeCompare(b.collectionName) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Which of a trade's pins move onto the half a partial settle splits off
 * (ADR-019, amendment 2026-08-10).
 *
 * `disposingCopyIds` is the giver's settle set, and any pin covering one of
 * those has to be in the answer: the copy is about to be hard-deleted, and
 * `card_trade_copies.copy_id` cascades, so a pin left behind on the remainder
 * would vanish with it and quietly leave the remainder short. Those go first,
 * then the count is filled from the rest in the order given, which the caller
 * has already put plainest-first. That ordering is the whole rule on the
 * receiver's side, where nothing is being disposed and the receiver has no say
 * over which of the giver's copies left.
 * @returns Up to `quantity` of `pinnedPlainestFirst`.
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
 * Whether a copy carries anything worth showing: a condition, a grade, an
 * alteration, a note, or a link. Mirrors `copyHasRecordedDetails` in
 * `apps/web/src/components/collection/copy-indicators.ts` so the server and the
 * client agree on what "unrecorded" means. The loan term is dropped for the
 * same reason as in {@link copyPinWeight}.
 * @returns `true` when the copy has any recorded detail.
 */
export function copyHasRecordedDetails(copy: TradeCopyRow): boolean {
  return (
    copy.condition !== null ||
    (copy.grader !== null && copy.grade !== null) ||
    copy.isAltered ||
    copy.notesPublic !== null ||
    copy.notesPrivate !== null ||
    copy.links.length > 0
  );
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
 * @returns A stable string key for the copy's user-visible traits.
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

/**
 * Whether the giver has a choice worth surfacing: more candidates than the
 * trade needs, and at least two of them differ in something a person cares
 * about. A stack of identical unrecorded copies from one binder is not a
 * decision. `byCollection` is the settle picker's stricter reading of
 * "differ" (see {@link distinguishingKey}).
 * @returns `true` when the client should prompt for a pick.
 */
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

/**
 * Maps one candidate copy row to its response shape.
 * @returns The serialized copy option.
 */
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
    hasRecordedDetails: copyHasRecordedDetails(copy),
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
 * @returns The serialized copy-options response.
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

/**
 * Live-trade phases from least to most committed. `asked` is a bid nobody has
 * acted on, `offered` already consumes the giver's supply, and `reserved` has
 * physical copies pinned. Clients that can only show one marker per card
 * collapse along this ladder, so the order is part of the contract, not a
 * presentation detail.
 *
 * The ladder stops at `reserved`. Settling is per side now, and a side that has
 * settled has nothing left to annotate (ADR-019, amendment 2026-08-10), so the
 * former `traded` rung has no rows to carry.
 */
const LIVE_PHASE_ORDER: readonly CardTradeLivePhase[] = ["asked", "offered", "reserved"];

/** Roles in their response order: the viewer's own copies first. */
const LIVE_ROLE_ORDER: readonly CardTradeRole[] = ["giver", "receiver"];

/**
 * Maps one aggregated bucket to its response shape. The counts arrive as
 * integers from the grouped query, but a `count(*)` that reached the driver as
 * a bigint string would silently serialize as one, so both go through `Number`.
 * @returns The serialized annotation.
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
 * @returns The serialized live-by-printing response.
 */
export function toCardTradeLiveByPrinting(
  rows: readonly LiveTradeAnnotationRow[],
): CardTradeLiveByPrintingResponse {
  const ordered = rows.toSorted(
    (a, b) =>
      a.printingId.localeCompare(b.printingId) ||
      LIVE_ROLE_ORDER.indexOf(a.role) - LIVE_ROLE_ORDER.indexOf(b.role) ||
      LIVE_PHASE_ORDER.indexOf(b.phase) - LIVE_PHASE_ORDER.indexOf(a.phase),
  );
  return { annotations: ordered.map((row) => toCardTradeLiveAnnotation(row)) };
}

/**
 * The counterparty's profile as the roster reads it, from any group they are
 * in — `friendGroups.listMembers` joined with the user row.
 */
export interface TradeSheetMemberRow {
  userId: string;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
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
 * @returns The serialized counterparty.
 */
export function toCardTradeCounterparty(
  member: TradeSheetMemberRow,
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
    name: member.userName,
    image: member.userImage,
    gravatarHash: gravatarHashForEmail(member.userEmail),
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
 * rule produced (ADR-034), which is a value of its own here: a rule-derived row
 * and a manual row on the same list are not the same row.
 * @returns A stable key over copy + buy side.
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
 * @returns The pooled rows, grouped by source group in the given order.
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
