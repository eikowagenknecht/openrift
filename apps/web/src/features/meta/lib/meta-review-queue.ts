import type { AdminMetaEventCorrection } from "@openrift/shared/contracts/admin/meta-submissions";
import type { MetaOverlayQueueRow } from "@openrift/shared/types/api/meta";
import type { MetaPlayerOverlayField } from "@openrift/shared/types/enums";
import { META_PLAYER_OVERLAY_FIELDS } from "@openrift/shared/types/enums";

export const META_REVIEW_TRIAGE = [
  "ready",
  "needsRow",
  "unmatched",
  "newEvent",
  "correction",
] as const;

export type MetaReviewTriage = (typeof META_REVIEW_TRIAGE)[number];

type MetaReviewTriageCounts = Record<MetaReviewTriage, number>;

export const META_REVIEW_TRIAGE_LABELS: Record<MetaReviewTriage, string> = {
  ready: "Ready",
  needsRow: "Needs a row",
  unmatched: "Unmatched cards",
  newEvent: "New events",
  correction: "Corrections",
};

interface MetaReviewBulkAcceptItem {
  id: string;
  metaEventPlayerId: string | null;
}

export interface MetaReviewGroup {
  key: string;
  metaEventId: string | null;
  name: string;
  slug: string | null;
  eventDate: string | null;
  format: string | null;
  providers: string[];
  proposal: MetaOverlayQueueRow | null;
  eventPatches: MetaOverlayQueueRow[];
  players: MetaOverlayQueueRow[];
  corrections: AdminMetaEventCorrection[];
  counts: MetaReviewTriageCounts;
  oldestAt: string;
}

function emptyTriageCounts(): MetaReviewTriageCounts {
  return { ready: 0, needsRow: 0, unmatched: 0, newEvent: 0, correction: 0 };
}

export function triageOverlay(row: MetaOverlayQueueRow): Exclude<MetaReviewTriage, "correction"> {
  if (row.kind === "event") {
    return row.metaEventId === null ? "newEvent" : "ready";
  }
  if (row.unresolvedNames.length > 0) {
    return "unmatched";
  }
  const state = row.match?.state ?? "unscored";
  return state === "linked" || state === "exact" ? "ready" : "needsRow";
}

function bulkAcceptItem(row: MetaOverlayQueueRow): MetaReviewBulkAcceptItem | null {
  if (row.kind !== "player" || triageOverlay(row) !== "ready") {
    return null;
  }
  return {
    id: row.id,
    metaEventPlayerId: row.match?.state === "exact" ? row.match.metaEventPlayerId : null,
  };
}

export function bulkAcceptItems(rows: readonly MetaOverlayQueueRow[]): MetaReviewBulkAcceptItem[] {
  return rows.map((row) => bulkAcceptItem(row)).filter((item) => item !== null);
}

function groupKey(row: MetaOverlayQueueRow): string {
  if (row.metaEventId !== null) {
    return `event:${row.metaEventId}`;
  }
  if (row.kind === "event") {
    return `proposal:${row.id}`;
  }
  if (row.eventOverlayId !== null) {
    return `proposal:${row.eventOverlayId}`;
  }
  return `loose:${row.id}`;
}

function correctionKey(correction: AdminMetaEventCorrection): string {
  return correction.event === null
    ? `gone:${correction.submission.id}`
    : `event:${correction.event.id}`;
}

function emptyGroup(key: string): MetaReviewGroup {
  return {
    key,
    metaEventId: null,
    name: "",
    slug: null,
    eventDate: null,
    format: null,
    providers: [],
    proposal: null,
    eventPatches: [],
    players: [],
    corrections: [],
    counts: emptyTriageCounts(),
    oldestAt: "",
  };
}

function noteOldest(group: MetaReviewGroup, at: string): void {
  if (group.oldestAt === "" || at < group.oldestAt) {
    group.oldestAt = at;
  }
}

function noteProvider(group: MetaReviewGroup, label: string): void {
  if (!group.providers.includes(label)) {
    group.providers.push(label);
  }
}

function fillEventFacts(group: MetaReviewGroup, row: MetaOverlayQueueRow): void {
  group.metaEventId ??= row.metaEventId;
  if (group.name === "") {
    group.name = row.metaEventName ?? row.proposedName ?? "";
  }
  group.slug ??= row.metaEventSlug;
  group.eventDate ??= row.eventDate;
  group.format ??= row.eventFormat;
}

function compareRows(a: MetaOverlayQueueRow, b: MetaOverlayQueueRow): number {
  if (a.rank !== b.rank) {
    if (a.rank === null) {
      return 1;
    }
    if (b.rank === null) {
      return -1;
    }
    return a.rank - b.rank;
  }
  return (
    (a.playerName ?? "").localeCompare(b.playerName ?? "") || a.createdAt.localeCompare(b.createdAt)
  );
}

export function groupReviewQueue(
  overlays: readonly MetaOverlayQueueRow[],
  corrections: readonly AdminMetaEventCorrection[],
): MetaReviewGroup[] {
  const groups = new Map<string, MetaReviewGroup>();
  const groupFor = (key: string): MetaReviewGroup => {
    let group = groups.get(key);
    if (group === undefined) {
      group = emptyGroup(key);
      groups.set(key, group);
    }
    return group;
  };

  for (const row of overlays) {
    const group = groupFor(groupKey(row));
    fillEventFacts(group, row);
    noteProvider(group, row.provider ?? "usersubmission");
    noteOldest(group, row.createdAt);
    group.counts[triageOverlay(row)] += 1;
    if (row.kind === "event") {
      if (row.metaEventId === null) {
        group.proposal = row;
      } else {
        group.eventPatches.push(row);
      }
    } else {
      group.players.push(row);
    }
  }

  for (const correction of corrections) {
    const group = groupFor(correctionKey(correction));
    if (correction.event !== null) {
      group.metaEventId ??= correction.event.id;
      if (group.name === "") {
        group.name = correction.event.name;
      }
      group.slug ??= correction.event.slug;
      group.eventDate ??= correction.event.eventDate;
      group.format ??= correction.event.format;
    } else if (group.name === "") {
      group.name = correction.submission.eventName;
    }
    noteProvider(group, "usersubmission");
    noteOldest(group, correction.submission.createdAt);
    group.counts.correction += 1;
    group.corrections.push(correction);
  }

  for (const group of groups.values()) {
    group.players.sort(compareRows);
  }

  return [...groups.values()].toSorted(
    (a, b) =>
      Number(b.proposal !== null) - Number(a.proposal !== null) ||
      a.oldestAt.localeCompare(b.oldestAt),
  );
}

export function sumTriageCounts(groups: readonly MetaReviewGroup[]): MetaReviewTriageCounts {
  const total = emptyTriageCounts();
  for (const group of groups) {
    for (const triage of META_REVIEW_TRIAGE) {
      total[triage] += group.counts[triage];
    }
  }
  return total;
}

/**
 * The claim mask an accept should send, or null to keep the overlay whole.
 * `cards` has no row of its own in `changes` and is added back whenever the
 * overlay printed lines.
 */
export function acceptClaimMask(
  row: MetaOverlayQueueRow,
  dropped: ReadonlySet<string>,
): MetaPlayerOverlayField[] | null {
  if (dropped.size === 0) {
    return null;
  }
  const known = new Set<string>(META_PLAYER_OVERLAY_FIELDS);
  const kept = row.changes
    .map((change) => change.field)
    .filter((field): field is MetaPlayerOverlayField => known.has(field) && !dropped.has(field));
  if (row.cards.length > 0 && !kept.includes("cards")) {
    kept.push("cards");
  }
  return kept;
}

export function totalTriageCount(counts: MetaReviewTriageCounts): number {
  return META_REVIEW_TRIAGE.reduce((sum, triage) => sum + counts[triage], 0);
}

export function filterGroup(
  group: MetaReviewGroup,
  triage: MetaReviewTriage,
): MetaReviewGroup | null {
  if (group.counts[triage] === 0) {
    return null;
  }
  const keepOverlay = (row: MetaOverlayQueueRow) => triageOverlay(row) === triage;
  return {
    ...group,
    proposal: group.proposal !== null && keepOverlay(group.proposal) ? group.proposal : null,
    eventPatches: group.eventPatches.filter(keepOverlay),
    players: group.players.filter(keepOverlay),
    corrections: triage === "correction" ? group.corrections : [],
  };
}
