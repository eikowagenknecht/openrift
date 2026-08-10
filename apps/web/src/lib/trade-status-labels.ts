import type { CardTradeLiveAnnotation, CardTradeLivePhase, CardTradeRole } from "@openrift/shared";
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";

// The single home for the live-trade wording. Every surface that marks a card
// as in-flight (collections grid, copies view, list rows, shared views) reads
// its words from here, so the same trade never reads two ways.

/**
 * How binding a phase is. `soft` is a bid nobody acted on, so the copies are
 * still free to promise elsewhere. `committed` means the copies are spoken for:
 * an offer already consumes the giver's supply, exactly as a reservation does.
 */
type LiveTradeTone = "soft" | "committed";

/** Which way the copies move, the one thing the word does not say. */
export type LiveTradeDirection = "incoming" | "outgoing";

/** Everything a chip needs to present one live-trade annotation. */
export interface LiveTradeStatusDescriptor {
  /** The user-facing word for the phase. Identical on both sides. */
  label: string;
  /** Which way the copies move. Carried by the icon, never by the word. */
  direction: LiveTradeDirection;
  icon: LucideIcon;
  tone: LiveTradeTone;
}

/** The annotation fields the wording is derived from. */
export type LiveTradeStatusInput = Pick<CardTradeLiveAnnotation, "role" | "phase">;

/**
 * One word per phase, the same on both sides of the trade. A card is
 * "Reserved" whether it is leaving or arriving, because the phase is all the
 * word is for. Naming the side in the word too meant a reader had to hold two
 * vocabularies for one ladder ("Asked for" against "Requested", "Reserved"
 * against "Coming to you") and still could not tell which way a card was going
 * without knowing whose surface they were on.
 *
 * The direction is the icon's job instead (see {@link ROLE_ICONS}): it reads at
 * a glance and reads the same way on every surface.
 *
 * "Requested" keeps the meaning it already carries on the shared-list request
 * strip: someone asked for this copy and nothing is promised yet.
 */
const PHASE_LABELS: Record<CardTradeLivePhase, string> = {
  asked: "Requested",
  offered: "Offered",
  reserved: "Reserved",
};

/**
 * The arrows /trades already uses for incoming and outgoing cards
 * (`TradeDirectionIcon` in `components/friend-groups/trade-row-parts.tsx`), so a
 * chip on a tile points the same way as the trade row it came from. With the
 * words shared, this icon is the only thing separating the two sides.
 *
 * Deliberately without the green/amber tint those badges carry. A tile can stack
 * this chip next to an on-loan chip and a marker row, and colour there would
 * turn the strip into a traffic light. Weight carries commitment instead.
 */
const ROLE_ICONS: Record<CardTradeRole, LucideIcon> = {
  giver: ArrowUpRightIcon,
  receiver: ArrowDownLeftIcon,
};

/**
 * The word, direction, icon and weight one live-trade annotation is shown with.
 * @param annotation The viewer's side and the trade's phase.
 * @returns The chip descriptor.
 */
export function liveTradeStatus(annotation: LiveTradeStatusInput): LiveTradeStatusDescriptor {
  return {
    label: PHASE_LABELS[annotation.phase],
    direction: annotation.role === "giver" ? "outgoing" : "incoming",
    icon: ROLE_ICONS[annotation.role],
    tone: annotation.phase === "asked" ? "soft" : "committed",
  };
}

/**
 * The label alone, for surfaces that lay the word out themselves.
 * @param annotation The viewer's side and the trade's phase.
 * @returns The user-facing word.
 */
export function liveTradeStatusLabel(annotation: LiveTradeStatusInput): string {
  return liveTradeStatus(annotation).label;
}

/**
 * The one status a public surface may show. A share link already exposes the
 * reserved flag, which reads as "not claimable"; every other phase is live
 * negotiation and stays off a page anyone can open.
 */
export const SHARED_RESERVED_STATUS: LiveTradeStatusInput = { role: "giver", phase: "reserved" };

/**
 * The chip's tooltip: the status word, then how many copies it covers. Mirrors
 * the on-loan chip's "n of this printing (m across all printings)" summary, so
 * two chips in one strip explain themselves the same way.
 *
 * `direction` is spelled out here because the arrow that carries it is
 * `aria-hidden` and a tooltip is a hover away regardless. Without it the word
 * alone ("Reserved · 2 copies") would leave a screen reader unable to tell an
 * arriving card from a departing one. Public surfaces omit it: a stranger
 * reading someone else's list has no side to be on.
 * @param label The status word.
 * @param direction Which way the copies move, or undefined to leave it out.
 * @param count Copies on the displayed printing, or undefined to name the status only.
 * @param totalCount The tile's figure across sibling printings, when it diverges.
 * @returns The tooltip sentence.
 */
export function tradeStatusTitle({
  label,
  direction,
  count,
  totalCount,
}: {
  label: string;
  direction?: LiveTradeDirection;
  count?: number;
  totalCount?: number;
}): string {
  const status = direction ? `${label} (${direction})` : label;
  if (count === undefined) {
    return status;
  }
  if (totalCount !== undefined && totalCount !== count) {
    return `${status} · ${count} of this printing (${totalCount} across all printings)`;
  }
  return `${status} · ${count} ${count === 1 ? "copy" : "copies"}`;
}
