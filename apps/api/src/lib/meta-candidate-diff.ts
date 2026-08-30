/**
 * The pure "what would accepting this candidate change?" computation for the
 * meta archive's ingest queue.
 *
 * Everything here is a function of two plain records, so the queue, the detail
 * view, the ingest pass (which auto-settles rows that match live) and the accept
 * path all read the same verdict. Nothing in this module touches the database.
 *
 * A diff exists to show a reviewer what will change, and to answer "is this row
 * already identical to live?". It is not itself the merge: several sources fan
 * into one live event, and taking one source's value for one field is
 * `acceptMetaEventField` in `meta-candidate-accept.ts`, which reads the same
 * field list this module compares.
 */
import { WellKnown } from "@openrift/shared";
import type { DiffValue } from "@openrift/shared/response-schemas";
import type { MetaListStatus } from "@openrift/shared/types";

export interface MetaFieldDiff {
  field: string;
  from: DiffValue;
  to: DiffValue;
}

/**
 * The event fields a candidate can propose. `slug` is not among them — it is
 * minted at accept. Neither is `source_url`: attribution lives in
 * `meta_event_sources`, where a candidate's URL becomes that provider's
 * citation when it is linked, so it is never a field the live row disagrees on.
 */
export interface MetaEventFields {
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  /** Nullable on the candidate side; the live row always holds one. */
  tier: string | null;
  country: string | null;
  location: string | null;
}

export interface MetaPlayerFields {
  /**
   * The live event the standings row sits under, by id. Accepting a candidate
   * re-parents its live row, so a candidate whose parent now points somewhere
   * else has to read as a change rather than as "in sync".
   *
   * Ids rather than names on purpose: two events may share a name, and a
   * re-parent between them is still a re-parent. Anything rendering this diff
   * swaps the ids for names on the way out.
   */
  event: string | null;
  playerName: string;
  rank: number;
  /** Whether {@link rank} is a cut bucket rather than an exact standing. */
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendCardId: string | null;
  championCardId: string | null;
  /**
   * How complete the list is. A source that publishes a decklist for an entry
   * the archive only had standings for, or fills in a partial one's
   * battlefields, changes this as well as the cards, and the reviewer has to
   * see it: leaving `"none"` is what gives the entry a public page.
   */
  listStatus: MetaListStatus;
}

export interface MetaDeckCardEntry {
  cardId: string;
  zone: string;
  quantity: number;
}

/**
 * The legend and champion a candidate row stands for: the list's own zones when
 * a list landed, the source's separately-published pick otherwise.
 *
 * A published decklist is the better authority when both exist, and the
 * source's pick is the only one for the deckless entries that make up most of a
 * field. Ingest and accept both read it, so the two agree on what "in sync"
 * means.
 */
export function resolveMetaPlayerCards(player: {
  cards: readonly { zone: string; cardId: string | null }[] | null;
  legendCardId: string | null;
  championCardId: string | null;
}): { legendCardId: string | null; championCardId: string | null } {
  const inZone = (zone: string) => player.cards?.find((card) => card.zone === zone)?.cardId ?? null;
  return {
    legendCardId: inZone(WellKnown.deckZone.LEGEND) ?? player.legendCardId,
    championCardId: inZone(WellKnown.deckZone.CHAMPION) ?? player.championCardId,
  };
}

/**
 * The archived deck a candidate's list stands for: its own resolved lines, plus
 * the Legend and Chosen Champion the source published beside the list rather
 * than inside it.
 *
 * uvsgames names every player's legend in the round standings but fills the
 * list's own Legend section on almost none of them, and that one card decides
 * the deck's domains — so a list that reaches the archive without it is missing
 * something the source did tell us. Unresolved lines are dropped, as they must
 * be: `deck_cards` needs real card ids, and {@link diffMetaDeckCards} compares
 * on them.
 *
 * Ingest and accept both read this, so "would accepting change the deck?" and
 * "what does accepting write?" cannot drift apart.
 *
 * @returns The deck's rows, or none at all for a standings-only entry.
 */
export function metaDeckCardEntries(player: {
  cards: readonly { zone: string; cardId: string | null; quantity: number }[] | null;
  legendCardId: string | null;
  championCardId: string | null;
}): MetaDeckCardEntry[] {
  if (player.cards === null) {
    return [];
  }
  const entries: MetaDeckCardEntry[] = [];
  for (const card of player.cards) {
    if (card.cardId !== null) {
      entries.push({ cardId: card.cardId, zone: card.zone, quantity: card.quantity });
    }
  }
  const resolved = resolveMetaPlayerCards(player);
  const seeds = [
    [WellKnown.deckZone.LEGEND, resolved.legendCardId],
    [WellKnown.deckZone.CHAMPION, resolved.championCardId],
  ] as const;
  for (const [zone, cardId] of seeds) {
    if (cardId !== null && !entries.some((entry) => entry.zone === zone)) {
      entries.push({ cardId, zone, quantity: 1 });
    }
  }
  return collapseCardEntries(entries);
}

export interface MetaDeckCardDiff {
  added: MetaDeckCardEntry[];
  removed: MetaDeckCardEntry[];
  changed: { cardId: string; zone: string; from: number; to: number }[];
}

export interface MetaPlayerDiff {
  fields: MetaFieldDiff[];
  cards: MetaDeckCardDiff;
}

export type MetaCandidateState = "new" | "changed" | "inSync";

const EVENT_FIELDS = [
  "name",
  "eventDate",
  "format",
  "playerCount",
  "organizer",
  "notes",
  "tier",
  "country",
  "location",
] as const satisfies readonly (keyof MetaEventFields)[];

const PLAYER_FIELDS = [
  "event",
  "playerName",
  "rank",
  "rankIsTier",
  "wins",
  "losses",
  "draws",
  "legendCardId",
  "championCardId",
  "listStatus",
] as const satisfies readonly (keyof MetaPlayerFields)[];

/**
 * Collapses the values that mean "nothing here" onto one. A source that omits
 * an organizer, one that sends `""`, and one that sends `"  "` must not read as
 * a change against a live NULL, which is the same rule the card ingest's
 * `normalize()` applies. Strings that survive keep their original spacing —
 * this decides absence, it does not rewrite content.
 */
export function normalize(value: string | number | boolean | null | undefined): DiffValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  return value;
}

function diffFields<Fields extends object>(
  live: Fields,
  candidate: Fields,
  fields: readonly (keyof Fields & string)[],
): MetaFieldDiff[] {
  const diffs: MetaFieldDiff[] = [];
  for (const field of fields) {
    const from = normalize(live[field] as string | number | boolean | null);
    const to = normalize(candidate[field] as string | number | boolean | null);
    if (from !== to) {
      diffs.push({ field, from, to });
    }
  }
  return diffs;
}

/**
 * Fields where a candidate null means "this producer knows nothing", not "there
 * is none": a user-submitted event carries no venue and no tier, and that must
 * neither read as a change against a live value nor null one out on accept.
 * `organizer` and `notes` stay ordinary — a source can genuinely have neither.
 */
export const META_EVENT_NO_CLAIM_FIELDS = ["tier", "country", "location"] as const;

export function diffMetaEvent(live: MetaEventFields, candidate: MetaEventFields): MetaFieldDiff[] {
  const silent = new Set<string>(
    META_EVENT_NO_CLAIM_FIELDS.filter((field) => normalize(candidate[field]) === null),
  );
  return diffFields(
    live,
    candidate,
    EVENT_FIELDS.filter((field) => !silent.has(field)),
  );
}

/**
 * A card list is keyed by card *and zone*, not by card alone: the same card
 * legitimately appears in `main` and `sideboard`, and keying on the card id
 * would report a phantom quantity change between the two.
 *
 * The separator is a space, which neither half can contain: card ids are uuids
 * and zones are slugs.
 */
function cardKey(entry: MetaDeckCardEntry): string {
  return `${entry.cardId} ${entry.zone}`;
}

/**
 * Sums rows that ended up on the same card and zone.
 *
 * A candidate's card list can legitimately hold two rows for one card: a source
 * that splits a playset across lines, or an alias fix that resolves two
 * spellings to the same card. `deck_cards` has one row per `(deck, card, zone)`,
 * so those have to be one row before they reach the archive — and the same
 * collapse has to happen before the diff, or an accepted deck would keep
 * reading as changed against the row it just wrote.
 */
export function collapseCardEntries(entries: readonly MetaDeckCardEntry[]): MetaDeckCardEntry[] {
  const byKey = new Map<string, MetaDeckCardEntry>();
  for (const entry of entries) {
    const key = cardKey(entry);
    const seen = byKey.get(key);
    if (seen === undefined) {
      byKey.set(key, { ...entry });
    } else {
      seen.quantity += entry.quantity;
    }
  }
  return [...byKey.values()];
}

/**
 * The candidate side must contain only *resolved* rows — a card whose name
 * matched nothing has no id to compare on, and such a deck cannot be accepted
 * at all. The caller reports the unresolved names separately.
 */
export function diffMetaDeckCards(
  live: readonly MetaDeckCardEntry[],
  candidate: readonly MetaDeckCardEntry[],
): MetaDeckCardDiff {
  const liveByKey = new Map(live.map((entry) => [cardKey(entry), entry]));
  const candidateByKey = new Map(candidate.map((entry) => [cardKey(entry), entry]));

  const added: MetaDeckCardEntry[] = [];
  const changed: MetaDeckCardDiff["changed"] = [];
  for (const entry of candidate) {
    const liveEntry = liveByKey.get(cardKey(entry));
    if (liveEntry === undefined) {
      added.push(entry);
    } else if (liveEntry.quantity !== entry.quantity) {
      changed.push({
        cardId: entry.cardId,
        zone: entry.zone,
        from: liveEntry.quantity,
        to: entry.quantity,
      });
    }
  }

  const removed = live.filter((entry) => !candidateByKey.has(cardKey(entry)));
  return { added, removed, changed };
}

export function diffMetaPlayer(
  live: MetaPlayerFields & { cards: readonly MetaDeckCardEntry[] },
  candidate: MetaPlayerFields & { cards: readonly MetaDeckCardEntry[] },
): MetaPlayerDiff {
  return {
    fields: diffFields(live, candidate, PLAYER_FIELDS),
    cards: diffMetaDeckCards(live.cards, candidate.cards),
  };
}

export function hasCardDiff(diff: MetaDeckCardDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

export function hasPlayerDiff(diff: MetaPlayerDiff): boolean {
  return diff.fields.length > 0 || hasCardDiff(diff.cards);
}

export function metaCandidateState(linked: boolean, hasDiff: boolean): MetaCandidateState {
  if (!linked) {
    return "new";
  }
  return hasDiff ? "changed" : "inSync";
}
