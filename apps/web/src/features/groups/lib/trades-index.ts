import {
  cardTradeState,
  isTradedCardTrade,
  needsViewerAction,
} from "@openrift/shared/card-trade-lifecycle";
import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
import type { FriendGroupMatchRow } from "@openrift/shared/types/api/friend-group";

import type { MatchSuggestionFields } from "./trade-derivation";
import { matchSuggestionKey, withoutLiveTradeMatches } from "./trade-derivation";
import { compareNeedsYou, sortNeedsYou } from "./trade-hub";

export type TradesIndexMatch = MatchSuggestionFields &
  Pick<FriendGroupMatchRow, "counterpartyName" | "counterpartyImage" | "counterpartyGravatarHash">;

export interface TradesIndexMatchGroup {
  groupId: string;
  groupName: string;
  incoming: readonly TradesIndexMatch[];
  outgoing: readonly TradesIndexMatch[];
}

export interface TradesIndexPerson {
  userId: string;
  name: string | null;
  image: string | null;
  gravatarHash: string;
  needsYou: CardTradeResponse[];
  waiting: CardTradeResponse[];
  doneCount: number;
  groupNames: string[];
  lastActivityAt: string | null;
  suggestions: number;
  suggestionPrintingIds: string[];
}

export interface TradesIndex {
  yourMove: TradesIndexPerson[];
  waiting: TradesIndexPerson[];
  couldTrade: TradesIndexPerson[];
  past: TradesIndexPerson[];
  groupCount: number;
}

interface PersonMatches {
  name: string | null;
  image: string | null;
  gravatarHash: string;
  suggestionKeys: Set<string>;
  printingIds: Set<string>;
  groupNames: Set<string>;
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

function compareBySuggestions(a: TradesIndexPerson, b: TradesIndexPerson): number {
  return b.suggestions - a.suggestions || compareByName(a, b);
}

function compareByActivity(a: TradesIndexPerson, b: TradesIndexPerson): number {
  return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
}

function sortedNames(names: Iterable<string>): string[] {
  return [...new Set(names)].toSorted((a, b) => a.localeCompare(b));
}

/** Suggestion keys carry no group, so a card reachable through two shared groups counts once. */
function aggregateMatches(
  groups: readonly TradesIndexMatchGroup[],
  trades: readonly CardTradeResponse[],
): { byPerson: Map<string, PersonMatches>; groupIds: Set<string> } {
  const byPerson = new Map<string, PersonMatches>();
  const groupIds = new Set<string>();
  for (const group of groups) {
    for (const direction of ["incoming", "outgoing"] as const) {
      const rows = withoutLiveTradeMatches(
        direction === "incoming" ? group.incoming : group.outgoing,
        trades,
      );
      for (const row of rows) {
        groupIds.add(group.groupId);
        const person = byPerson.get(row.counterpartyUserId) ?? {
          name: row.counterpartyName,
          image: row.counterpartyImage,
          gravatarHash: row.counterpartyGravatarHash,
          suggestionKeys: new Set<string>(),
          printingIds: new Set<string>(),
          groupNames: new Set<string>(),
        };
        person.suggestionKeys.add(matchSuggestionKey(direction, row));
        person.printingIds.add(row.printingId);
        person.groupNames.add(group.groupName);
        byPerson.set(row.counterpartyUserId, person);
      }
    }
  }
  return { byPerson, groupIds };
}

/** A counterparty whose account is gone has no sheet to open, so their trades stay out of the index. */
export function buildTradesIndex(
  trades: readonly CardTradeResponse[],
  matchGroups: readonly TradesIndexMatchGroup[] = [],
): TradesIndex {
  const matches = aggregateMatches(matchGroups, trades);
  const byPerson = Map.groupBy(trades, (trade) => trade.counterparty.userId);
  const people: TradesIndexPerson[] = [];
  for (const [userId, own] of byPerson) {
    const latest = own[0];
    if (userId === null || latest === undefined) {
      continue;
    }
    const theirMatches = matches.byPerson.get(userId);
    people.push({
      userId,
      name: latest.counterparty.name,
      image: latest.counterparty.image,
      gravatarHash: latest.counterparty.gravatarHash,
      needsYou: sortNeedsYou(own.filter((trade) => needsViewerAction(trade))),
      waiting: own.filter((trade) => cardTradeState(trade) === "waiting-on-them"),
      doneCount: own.filter((trade) => isTradedCardTrade(trade)).length,
      groupNames: sortedNames([
        ...own.map((trade) => trade.groupName),
        ...(theirMatches?.groupNames ?? []),
      ]),
      lastActivityAt: own.reduce(
        (max, trade) => (trade.updatedAt > max ? trade.updatedAt : max),
        latest.updatedAt,
      ),
      suggestions: theirMatches?.suggestionKeys.size ?? 0,
      suggestionPrintingIds: [...(theirMatches?.printingIds ?? [])],
    });
  }
  for (const [userId, theirMatches] of matches.byPerson) {
    if (byPerson.has(userId)) {
      continue;
    }
    people.push({
      userId,
      name: theirMatches.name,
      image: theirMatches.image,
      gravatarHash: theirMatches.gravatarHash,
      needsYou: [],
      waiting: [],
      doneCount: 0,
      groupNames: sortedNames(theirMatches.groupNames),
      lastActivityAt: null,
      suggestions: theirMatches.suggestionKeys.size,
      suggestionPrintingIds: [...theirMatches.printingIds],
    });
  }
  const settled = people.filter(
    (person) => person.needsYou.length === 0 && person.waiting.length === 0,
  );
  return {
    yourMove: people.filter((person) => person.needsYou.length > 0).toSorted(compareByUrgency),
    waiting: people
      .filter((person) => person.needsYou.length === 0 && person.waiting.length > 0)
      .toSorted(compareByName),
    couldTrade: settled.filter((person) => person.suggestions > 0).toSorted(compareBySuggestions),
    past: settled.filter((person) => person.suggestions === 0).toSorted(compareByActivity),
    groupCount: new Set([...trades.map((trade) => trade.groupId), ...matches.groupIds]).size,
  };
}
