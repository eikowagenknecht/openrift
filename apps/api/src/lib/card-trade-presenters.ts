import type { CopyLink } from "@openrift/shared";
import type {
  CardTradeCopyOption,
  CardTradeCopyOptionsResponse,
  CardTradeLiveAnnotation,
  CardTradeLiveByPrintingResponse,
  CardTradeLivePhase,
  CardTradeRole,
} from "@openrift/shared/types";

import type { LiveTradeAnnotationRow } from "../repositories/card-trades.js";

/**
 * One candidate copy behind a pending trade, as `copies.listMetadataByIds`
 * reads it. Every candidate is the same printing and comes from the giver's
 * reservable supply, so none of them is altered, reserved or out on a loan.
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
 * Orders candidates plainest-first, id as a stable tiebreak. The first
 * `quantity` entries are what an accept without an explicit choice pins.
 * @returns A new array in default pin order.
 */
export function sortCopiesForPinning(copies: readonly TradeCopyRow[]): TradeCopyRow[] {
  return copies.toSorted((a, b) => copyPinWeight(a) - copyPinWeight(b) || a.id.localeCompare(b.id));
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
 * The collection is deliberately out of the key. Two plain copies filed in two
 * binders are still the same card, and counting that as a difference would fire
 * the picker on nearly every trade. Printing-level traits (finish, art variant,
 * language) are out too, but for a stronger reason: a trade names one printing,
 * so every candidate shares them.
 * @returns A stable string key for the copy's user-visible traits.
 */
function distinguishingKey(copy: TradeCopyRow): string {
  return JSON.stringify([
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
 * about. A stack of identical unrecorded copies is not a decision.
 * @returns `true` when the client should prompt for a pick.
 */
export function cardTradeChoiceMatters(copies: readonly TradeCopyRow[], quantity: number): boolean {
  if (copies.length <= quantity) {
    return false;
  }
  const keys = new Set(copies.map((copy) => distinguishingKey(copy)));
  return keys.size > 1;
}

/**
 * Maps one candidate copy row to its response shape.
 * @returns The serialized copy option.
 */
export function toCardTradeCopyOption(copy: TradeCopyRow): CardTradeCopyOption {
  return {
    id: copy.id,
    collectionId: copy.collectionId,
    collectionName: copy.collectionName,
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
 * Maps a pending trade's candidate copies to the giver-facing options payload.
 * `copies` comes back in default pin order, so `copies.slice(0, quantity)` is
 * what an accept without an explicit choice would promise.
 * @returns The serialized copy-options response.
 */
export function toCardTradeCopyOptions(input: {
  tradeId: string;
  quantity: number;
  copies: readonly TradeCopyRow[];
}): CardTradeCopyOptionsResponse {
  const ordered = sortCopiesForPinning(input.copies);
  return {
    tradeId: input.tradeId,
    quantity: input.quantity,
    choiceMatters: cardTradeChoiceMatters(ordered, input.quantity),
    copies: ordered.map((copy) => toCardTradeCopyOption(copy)),
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
