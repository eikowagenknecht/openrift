import { formatRelativeTime } from "@openrift/shared";
import type { MetaCatalogRow } from "@openrift/shared/contracts/admin/meta-catalog";
import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

// What an accepted catalogue row has actually pulled back from the source
// (ADR-014). The counts are staged, not archived: they say what the last deep
// fetch found, which is the thing the recheck ladder is chasing.

/** The staged coverage fields, so the chips can be rendered from a bare row. */
export type MetaCoverageRow = Pick<
  MetaCatalogRow,
  | "triage"
  | "displayStatus"
  | "decklistStatus"
  | "fetchedAt"
  | "stagedPlayerCount"
  | "stagedLegendCount"
  | "stagedDeckCount"
  | "nextCheckAt"
  | "startAt"
>;

/**
 * Where the recheck ladder has this event. An accepted event is visited hourly
 * while it runs and on a slowing schedule afterwards, so "when is the next
 * visit" is a different question from "what did the last one find".
 *
 * @param row - The accepted catalogue row.
 * @param now - The instant the relative times are measured against.
 * @returns The hint, or an empty string when there is nothing to say.
 */
function coverageRecheckHint(row: MetaCoverageRow, now: Date): string {
  if (row.triage !== "accepted") {
    return "";
  }
  if (row.nextCheckAt === null) {
    return "ladder done";
  }
  if (new Date(row.startAt).getTime() > now.getTime()) {
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

/**
 * The staged coverage of one accepted catalogue row: standings, the legends
 * among them, and the decklists. Nothing is drawn for a row that is not
 * accepted, because nothing has been fetched for it.
 *
 * @param row - The catalogue row.
 * @param now - The instant the recheck hint is measured against; defaults to real time.
 * @returns The coverage chips, or null when the row is not accepted.
 */
export function MetaCoverageChips({ row, now }: { row: MetaCoverageRow; now?: Date }) {
  // Resolved in the body, not as a parameter default: the React Compiler cannot
  // lower a destructuring default whose value is a call.
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
