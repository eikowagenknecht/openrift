import {
  cardTradeState,
  isTradedCardTrade,
  needsViewerAction,
} from "@openrift/shared/card-trade-lifecycle";
import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";

import { compareNeedsYou, sortNeedsYou } from "./trade-hub";

export interface TradesIndexPerson {
  userId: string;
  name: string | null;
  image: string | null;
  gravatarHash: string;
  needsYou: CardTradeResponse[];
  waiting: CardTradeResponse[];
  doneCount: number;
  groupNames: string[];
  lastActivityAt: string;
}

export interface TradesIndex {
  yourMove: TradesIndexPerson[];
  waiting: TradesIndexPerson[];
  past: TradesIndexPerson[];
  groupCount: number;
}

function personName(person: TradesIndexPerson): string {
  return person.name ?? "\u{FFFF}";
}

function compareByName(a: TradesIndexPerson, b: TradesIndexPerson): number {
  return personName(a).localeCompare(personName(b));
}

function compareByUrgency(a: TradesIndexPerson, b: TradesIndexPerson): number {
  const first = a.needsYou[0];
  const second = b.needsYou[0];
  if (first === undefined || second === undefined) {
    return compareByName(a, b);
  }
  return compareNeedsYou(first, second) || compareByName(a, b);
}

/** A counterparty whose account is gone has no sheet to open, so their trades stay out of the index. */
export function buildTradesIndex(trades: readonly CardTradeResponse[]): TradesIndex {
  const byPerson = Map.groupBy(trades, (trade) => trade.counterparty.userId);
  const people: TradesIndexPerson[] = [];
  for (const [userId, own] of byPerson) {
    const latest = own[0];
    if (userId === null || latest === undefined) {
      continue;
    }
    people.push({
      userId,
      name: latest.counterparty.name,
      image: latest.counterparty.image,
      gravatarHash: latest.counterparty.gravatarHash,
      needsYou: sortNeedsYou(own.filter((trade) => needsViewerAction(trade))),
      waiting: own.filter((trade) => cardTradeState(trade) === "waiting-on-them"),
      doneCount: own.filter((trade) => isTradedCardTrade(trade)).length,
      groupNames: [...new Set(own.map((trade) => trade.groupName))].toSorted((a, b) =>
        a.localeCompare(b),
      ),
      lastActivityAt: own.reduce(
        (max, trade) => (trade.updatedAt > max ? trade.updatedAt : max),
        latest.updatedAt,
      ),
    });
  }
  return {
    yourMove: people.filter((person) => person.needsYou.length > 0).toSorted(compareByUrgency),
    waiting: people
      .filter((person) => person.needsYou.length === 0 && person.waiting.length > 0)
      .toSorted(compareByName),
    past: people
      .filter((person) => person.needsYou.length === 0 && person.waiting.length === 0)
      .toSorted((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    groupCount: new Set(trades.map((trade) => trade.groupId)).size,
  };
}
