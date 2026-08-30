import type {
  MetaEventDetail,
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
} from "@openrift/shared";
import type { ReactNode } from "react";

/**
 * Fixtures and the router stub the event-page component tests share, so the
 * five sections of one page are not each described by their own idea of what a
 * standings row looks like.
 */

/** A deckless entry unless overridden, which is most of a real field. */
export function metaPlayer(overrides: Partial<MetaEventPlayer> = {}): MetaEventPlayer {
  return {
    id: "p-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Ana",
    wins: 6,
    losses: 1,
    draws: null,
    legend: {
      cardId: "card-yasuo",
      name: "Yasuo, the Unforgiven",
      slug: "yasuo-the-unforgiven",
      imageId: null,
      domains: ["fury"],
    },
    champion: null,
    deckId: null,
    deckName: null,
    shareToken: null,
    listStatus: "none",
    ...overrides,
  };
}

/** A small store event unless overridden. */
export function metaEvent(overrides: Partial<MetaEventDetail> = {}): MetaEventDetail {
  return {
    id: "evt",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "freeform",
    playerCount: 64,
    organizer: "LGS Berlin",
    tier: "store",
    country: null,
    location: null,
    playerRowCount: 0,
    deckCount: 0,
    winners: [],
    notes: null,
    sources: [],
    contributors: [],
    ...overrides,
  };
}

/** A decided top-cut game unless overridden. */
export function metaMatch(overrides: Partial<MetaEventMatch> = {}): MetaEventMatch {
  return {
    phaseOrder: 2,
    roundNumber: 1,
    tableNumber: 1,
    isBye: false,
    isDraw: false,
    player1Id: "p-1",
    player2Id: "p-2",
    winnerId: "p-1",
    gamesWonP1: 2,
    gamesWonP2: 0,
    ...overrides,
  };
}

/** The top-8 cut unless overridden. */
export function metaPhase(overrides: Partial<MetaEventPhase> = {}): MetaEventPhase {
  return {
    phaseOrder: 2,
    name: "Phase 3",
    roundType: "RANKED_SINGLE_ELIMINATION",
    roundCount: 3,
    rankRequired: 8,
    ...overrides,
  };
}

interface StubLinkProps {
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  className?: string;
  children?: ReactNode;
}

/**
 * A `Link` that renders the href it would navigate to, search params included,
 * so a test can assert what a "+ Add" link prefills rather than only that it
 * exists.
 */
export function StubLink({ to = "", params, search, className, children }: StubLinkProps) {
  let path = to;
  for (const [key, value] of Object.entries(params ?? {})) {
    path = path.replace(`$${key}`, value);
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return (
    <a href={`${path}${suffix}`} className={className}>
      {children}
    </a>
  );
}
