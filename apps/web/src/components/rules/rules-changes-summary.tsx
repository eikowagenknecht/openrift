import type { RuleChangesResponse } from "@openrift/shared";

import type { RuleMoves } from "@/lib/rules-changes";

export function ChangesSummary({
  previousVersion,
  changes,
  moves,
  silentChanges,
}: {
  previousVersion: string;
  changes: RuleChangesResponse;
  moves: RuleMoves;
  silentChanges: ReadonlySet<string>;
}) {
  const movesCount = moves.newToOld.size;
  const replacedCount = moves.displacedSet.size;
  const movedFromAdded = moves.toAddedSet.size;
  const movedFromModified = movesCount - movedFromAdded;
  const newCount = changes.added.length - movedFromAdded;
  const changedCount =
    Object.keys(changes.modifiedPrev).length -
    movedFromModified -
    replacedCount -
    silentChanges.size;
  const removedCount = changes.removed.length - moves.fromRemovedSet.size;
  if (
    newCount === 0 &&
    changedCount === 0 &&
    removedCount === 0 &&
    movesCount === 0 &&
    replacedCount === 0
  ) {
    return null;
  }
  return (
    <div className="border-border bg-muted/30 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs">
      <span className="text-muted-foreground">Changes from v{previousVersion}:</span>
      <span className="text-emerald-700 dark:text-emerald-300">
        <span className="font-semibold">{newCount}</span> new
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-amber-700 dark:text-amber-300">
        <span className="font-semibold">{changedCount}</span> changed
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-sky-700 dark:text-sky-300">
        <span className="font-semibold">{movesCount}</span> moved
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-violet-700 dark:text-violet-300">
        <span className="font-semibold">{replacedCount}</span> replaced
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-destructive">
        <span className="font-semibold">{removedCount}</span> removed
      </span>
    </div>
  );
}
