import type { RuleChangesResponse } from "@openrift/shared/types/api/rules";

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
    <div className="bg-muted/30 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs">
      <span className="text-muted-foreground">Changes from v{previousVersion}:</span>
      <span className="text-success">
        <span className="font-semibold">{newCount}</span> new
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-warning">
        <span className="font-semibold">{changedCount}</span> changed
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-info">
        <span className="font-semibold">{movesCount}</span> moved
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-violet">
        <span className="font-semibold">{replacedCount}</span> replaced
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-destructive">
        <span className="font-semibold">{removedCount}</span> removed
      </span>
    </div>
  );
}
