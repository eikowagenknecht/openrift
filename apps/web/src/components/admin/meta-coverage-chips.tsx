import { formatRelativeTime } from "@openrift/shared/format-date";
import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { MetaCoverageRow } from "@/lib/meta-catalog-display";

function coverageRecheckHint(row: MetaCoverageRow, now: Date): string {
  if (row.triage !== "accepted") {
    return "";
  }
  if (row.nextCheckAt === null) {
    return "ladder done";
  }
  if (row.startAt !== null && new Date(row.startAt).getTime() > now.getTime()) {
    return `starts ${formatRelativeTime(row.startAt, { now })}`;
  }
  if (row.displayStatus !== "complete") {
    return "watching hourly";
  }
  return `next check ${formatRelativeTime(row.nextCheckAt, { now })}`;
}

function CoverageChip({
  done,
  children,
  variant,
}: {
  done: boolean;
  children: string;
  variant: "success" | "warning" | "muted";
}) {
  return (
    <Badge variant={variant}>
      {done && <CheckIcon />}
      {children}
    </Badge>
  );
}

export function MetaCoverageChips({ row, now }: { row: MetaCoverageRow; now?: Date }) {
  // React Compiler cannot lower a destructuring default whose value is a call.
  const at = now ?? new Date();

  if (row.triage !== "accepted") {
    return null;
  }

  const fetched = row.fetchedAt !== null;
  const players = row.stagedPlayerCount;
  const legends = row.stagedLegendCount;
  const decks = row.stagedDeckCount;
  const decklistsPublished = row.decklistStatus === "PUBLISHED";
  const hint = coverageRecheckHint(row, at);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {fetched && players > 0 ? (
        <CoverageChip done variant="success">{`${players} standings`}</CoverageChip>
      ) : (
        <CoverageChip done={false} variant="warning">
          Standings pending
        </CoverageChip>
      )}

      {fetched &&
        (legends > 0 ? (
          <CoverageChip done variant="success">{`${legends} legends`}</CoverageChip>
        ) : (
          <CoverageChip done={false} variant="muted">
            No legends
          </CoverageChip>
        ))}

      {decks > 0 && <CoverageChip done variant="success">{`${decks} decks`}</CoverageChip>}
      {decks === 0 && decklistsPublished && (
        <CoverageChip done={false} variant="warning">
          Decks pending
        </CoverageChip>
      )}
      {decks === 0 && !decklistsPublished && (
        <CoverageChip done={false} variant="muted">
          No decklists
        </CoverageChip>
      )}

      {hint !== "" && <span className="text-muted-foreground">{hint}</span>}
    </div>
  );
}
