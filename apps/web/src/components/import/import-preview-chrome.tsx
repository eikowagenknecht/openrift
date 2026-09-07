import { CheckCircle2Icon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Pressable } from "@/components/ui/pressable";
import { SOCIAL_LINKS } from "@/lib/social-links";

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
            // Badge's built-in hover rules only target anchor renders.
            className="hover:bg-destructive/20"
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

/** `unit` names what a source record is called on the surface: CSV import reads rows, a plain-text list reads lines. */
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
    <details className="bg-warning-soft border-warning/40 rounded-md border">
      <summary className="text-warning cursor-pointer px-3 py-2 font-medium">
        {errors.length} {unit}
        {errors.length === 1 ? "" : "s"} could not be read
      </summary>
      <div className="border-warning/40 border-t px-3 py-2">
        {errors.map((error) => (
          <p key={error} className="text-warning">
            {error}
          </p>
        ))}
      </div>
    </details>
  );
}

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
        <CheckCircle2Icon className="text-success size-4" />
        <span>{count} matched exactly</span>
      </summary>
      <div className="divide-border divide-y border-t">{children}</div>
    </details>
  );
}

export function ImportToVerifyNote({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }

  return (
    <p className="text-muted-foreground text-sm">
      Best guess picked for {count} {count === 1 ? "card" : "cards"} (marked{" "}
      <span className="text-warning">to verify</span>). Open each to confirm.
    </p>
  );
}

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
