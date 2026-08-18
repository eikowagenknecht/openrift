import { MinusIcon, PlusIcon } from "lucide-react";

import type { RosterListDelta } from "@/lib/meta-deck-roster";
import { hasListDelta } from "@/lib/meta-deck-roster";
import { cn } from "@/lib/utils";

/** One rendered line of the diff: what changes, by how much, in which zone. */
interface DiffLine {
  key: string;
  kind: "added" | "removed" | "changed";
  name: string;
  zone: string;
  /** "3", or "3 → 2" for a quantity change. */
  quantity: string;
}

/** @returns The card's name, or a placeholder when the row vanished under us. */
function cardLabel(name: string | null): string {
  return name ?? "Unknown card";
}

/**
 * Flattens a delta into display lines: additions, then removals, then quantity
 * changes. Exported for the tests, which assert on the lines rather than on the
 * markup around them.
 *
 * @param delta - The added / removed / changed rows.
 * @param zoneLabel - Resolves a zone slug to its display label.
 * @returns The lines to render, in display order.
 */
export function buildListDiffLines(
  delta: RosterListDelta,
  zoneLabel: (zone: string) => string,
): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const card of delta.added) {
    lines.push({
      // Two rows can share a card id across zones, and an unresolved row has a
      // name for an id, so the key needs both plus the kind.
      key: `added:${card.cardId}:${card.zone}`,
      kind: "added",
      name: cardLabel(card.name),
      zone: zoneLabel(card.zone),
      quantity: String(card.quantity),
    });
  }
  for (const card of delta.removed) {
    lines.push({
      key: `removed:${card.cardId}:${card.zone}`,
      kind: "removed",
      name: cardLabel(card.name),
      zone: zoneLabel(card.zone),
      quantity: String(card.quantity),
    });
  }
  for (const card of delta.changed) {
    lines.push({
      key: `changed:${card.cardId}:${card.zone}`,
      kind: "changed",
      name: cardLabel(card.name),
      zone: zoneLabel(card.zone),
      quantity: `${card.from} → ${card.to}`,
    });
  }
  return lines;
}

const KIND_CLASS = {
  added: "text-green-700 dark:text-green-400",
  removed: "text-red-700 dark:text-red-400",
  changed: "text-amber-700 dark:text-amber-400",
} as const;

/**
 * What taking this source's list would do to the archived deck, card by card
 * (ADR-014: the roster's expanded row). An unlinked candidate has nothing to
 * diff against, so its whole list arrives as additions — which is exactly what
 * accepting it writes.
 *
 * @returns The diff list, or a one-line "identical" note when nothing changes.
 */
export function MetaDeckListDiff({
  delta,
  zoneLabel,
  emptyLabel = "This list matches the archived deck.",
}: {
  delta: RosterListDelta;
  zoneLabel: (zone: string) => string;
  /** What to say when the delta is empty. */
  emptyLabel?: string;
}) {
  if (!hasListDelta(delta)) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  const lines = buildListDiffLines(delta, zoneLabel);
  return (
    <ul className="space-y-0.5">
      {lines.map((line) => (
        <li
          key={line.key}
          className={cn("flex items-center gap-1.5 text-sm", KIND_CLASS[line.kind])}
        >
          {line.kind === "added" && <PlusIcon className="size-3.5 shrink-0" />}
          {line.kind === "removed" && <MinusIcon className="size-3.5 shrink-0" />}
          <span className="tabular-nums">{line.quantity}</span>
          <span className="min-w-0 truncate">{line.name}</span>
          <span className="text-muted-foreground shrink-0">{line.zone}</span>
        </li>
      ))}
    </ul>
  );
}
