import type { CardTradeLiveAnnotation, CardTradeLivePhase } from "@openrift/shared";
import type { LucideIcon } from "lucide-react";
import { ClockIcon, HandshakeIcon, PackageCheckIcon } from "lucide-react";

// The single home for the live-trade wording. Every surface that marks a card
// as in-flight (collections grid, copies view, list rows, shared views) reads
// its words from here, so the same trade never reads two ways.

/**
 * How binding a phase is. `soft` is a bid nobody acted on, so the copies are
 * still free to promise elsewhere. `committed` means the copies are spoken for:
 * an offer already consumes the giver's supply, exactly as a reservation does.
 */
type LiveTradeTone = "soft" | "committed";

/** Everything a chip needs to present one live-trade annotation. */
export interface LiveTradeStatusDescriptor {
  /** The user-facing word for this side and phase. */
  label: string;
  icon: LucideIcon;
  tone: LiveTradeTone;
}

/** The annotation fields the wording is derived from. */
export type LiveTradeStatusInput = Pick<CardTradeLiveAnnotation, "role" | "phase">;

/**
 * The viewer's own copy is at stake. "Asked for" is someone else's bid on it;
 * the other three all mean the copy is spoken for and must not be promised
 * again.
 */
const GIVER_LABELS: Record<CardTradeLivePhase, string> = {
  asked: "Asked for",
  offered: "Offered",
  reserved: "Reserved",
  traded: "Traded",
};

/**
 * A card coming to the viewer. "Requested" keeps the meaning it already has on
 * the shared-list request strip (the viewer asked for this copy), so it never
 * appears on the giver side.
 */
const RECEIVER_LABELS: Record<CardTradeLivePhase, string> = {
  asked: "Requested",
  offered: "Offered to you",
  reserved: "Coming to you",
  traded: "Ready to add",
};

/**
 * Icons run on the commitment ladder, not on the side. A clock is the app's
 * existing mark for a request nobody has acted on. Offered and Reserved share
 * the handshake on purpose: both mean the copies are spoken for, so neither may
 * read as the weaker one. The package check closes the trade out, pointing at
 * the collection change still to apply.
 */
const PHASE_ICONS: Record<CardTradeLivePhase, LucideIcon> = {
  asked: ClockIcon,
  offered: HandshakeIcon,
  reserved: HandshakeIcon,
  traded: PackageCheckIcon,
};

/**
 * The word, icon and weight one live-trade annotation is shown with.
 * @param annotation The viewer's side and the trade's phase.
 * @returns The chip descriptor.
 */
export function liveTradeStatus(annotation: LiveTradeStatusInput): LiveTradeStatusDescriptor {
  const labels = annotation.role === "giver" ? GIVER_LABELS : RECEIVER_LABELS;
  return {
    label: labels[annotation.phase],
    icon: PHASE_ICONS[annotation.phase],
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
 * @param label The status word.
 * @param count Copies on the displayed printing, or undefined to name the status only.
 * @param totalCount The tile's figure across sibling printings, when it diverges.
 * @returns The tooltip sentence.
 */
export function tradeStatusTitle({
  label,
  count,
  totalCount,
}: {
  label: string;
  count?: number;
  totalCount?: number;
}): string {
  if (count === undefined) {
    return label;
  }
  if (totalCount !== undefined && totalCount !== count) {
    return `${label} · ${count} of this printing (${totalCount} across all printings)`;
  }
  return `${label} · ${count} ${count === 1 ? "copy" : "copies"}`;
}
