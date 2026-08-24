import { CheckCircle2Icon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Pressable } from "@/components/ui/pressable";
import { SOCIAL_LINKS } from "@/lib/social-links";

/**
 * The status badge row shown above the import button on every import preview
 * (collections, decks, lists). Counts of zero are omitted, except `ready` which
 * always shows so the row is never empty.
 *
 * The badge row sits below the entry list, so with `onJumpToNeedsAttention` the
 * needs-attention count becomes the way back to the first row that needs work —
 * those rows are ordered among all the others, not gathered at the top.
 * @returns The badge row.
 */
export function ImportStatusBadges({
  readyCount,
  toVerifyCount,
  needsAttentionCount,
  skippedCount,
  onJumpToNeedsAttention,
}: {
  readyCount: number;
  toVerifyCount: number;
  needsAttentionCount: number;
  skippedCount: number;
  /** Makes the needs-attention badge a button that scrolls to the first such row. */
  onJumpToNeedsAttention?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">{readyCount} ready</Badge>
      {toVerifyCount > 0 && <Badge variant="warning">{toVerifyCount} to verify</Badge>}
      {needsAttentionCount > 0 &&
        (onJumpToNeedsAttention ? (
          <Badge
            variant="destructive"
            render={<Pressable />}
            // The badge's own hover rules only target anchors, so a button
            // rendering needs its feedback spelled out.
            className="hover:bg-destructive/20 dark:hover:bg-destructive/30"
            aria-label={`Jump to the first of ${needsAttentionCount} ${
              needsAttentionCount === 1 ? "row" : "rows"
            } that need attention`}
            onClick={onJumpToNeedsAttention}
          >
            {needsAttentionCount} need attention
          </Badge>
        ) : (
          <Badge variant="destructive">{needsAttentionCount} need attention</Badge>
        ))}
      {skippedCount > 0 && <Badge variant="ghost">{skippedCount} skipped</Badge>}
    </div>
  );
}

/**
 * Folded list of source rows the parser could not turn into an entry at all.
 * `unit` names what a source record is called on the surface: a CSV import
 * reads rows, a plain-text list reads lines.
 * @returns The disclosure, or null when there is nothing to report.
 */
export function ImportParseErrorDetails({
  errors,
  unit,
}: {
  errors: string[];
  unit: "row" | "line";
}) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <details className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
      <summary className="cursor-pointer px-3 py-2 font-medium text-amber-800 dark:text-amber-300">
        {errors.length} {unit}
        {errors.length === 1 ? "" : "s"} could not be read
      </summary>
      <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-900">
        {errors.map((error) => (
          <p key={error} className="text-amber-700 dark:text-amber-400">
            {error}
          </p>
        ))}
      </div>
    </details>
  );
}

/**
 * Folds the exactly-matched rows away so attention stays on the entries that
 * still need action. Children are the rendered rows.
 * @returns The disclosure, or null when nothing matched exactly.
 */
export function ImportExactMatchesDisclosure({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <details className="group rounded-md border">
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 px-4 py-2.5">
        <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
        <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
        <span>{count} matched exactly</span>
      </summary>
      <div className="divide-border divide-y border-t">{children}</div>
    </details>
  );
}

/**
 * Explains that best-guess rows import as-is.
 * @returns The note, or null when nothing needs verifying.
 */
export function ImportToVerifyNote({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }

  return (
    <p className="text-muted-foreground text-sm">
      Best guess picked for {count} {count === 1 ? "card" : "cards"} (marked{" "}
      <span className="text-amber-600 dark:text-amber-400">to verify</span>). Open each to confirm.
    </p>
  );
}

/**
 * Points users at the issue tracker when rows could not be matched.
 * @returns The note, or null when every row resolved.
 */
export function ImportTroubleNote({ needsAttentionCount }: { needsAttentionCount: number }) {
  if (needsAttentionCount === 0) {
    return null;
  }

  return (
    <p className="text-muted-foreground text-sm">
      Having trouble importing?{" "}
      <a
        href={SOCIAL_LINKS.githubIssues}
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Open a GitHub issue
      </a>{" "}
      and we&apos;ll take a look.
    </p>
  );
}
