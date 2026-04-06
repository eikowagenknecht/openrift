import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAcceptTypographyFix, useTypographyReview } from "@/hooks/use-typography-review";

interface DiffSegment {
  text: string;
  type: "equal" | "removed" | "added";
}

/**
 * Computes a character-level diff between two strings using LCS.
 * @returns array of segments tagged as equal, removed, or added
 */
function diffChars(before: string, after: string): DiffSegment[] {
  const m = before.length;
  const n = after.length;

  // Build LCS length table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from<number>({ length: n + 1 }).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        before[i - 1] === after[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff operations
  const raw: { char: string; type: "equal" | "removed" | "added" }[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
      raw.push({ char: before[i - 1], type: "equal" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ char: after[j - 1], type: "added" });
      j--;
    } else {
      raw.push({ char: before[i - 1] ?? "", type: "removed" });
      i--;
    }
  }
  raw.reverse();

  // Merge consecutive same-type segments
  const segments: DiffSegment[] = [];
  for (const item of raw) {
    const last = segments.at(-1);
    if (last && last.type === item.type) {
      last.text += item.char;
    } else {
      segments.push({ text: item.char, type: item.type });
    }
  }
  return segments;
}

/**
 * Renders diff segments for one side of the comparison.
 * @returns highlighted text nodes for either the "current" or "proposed" column
 */
function renderDiffSide(segments: DiffSegment[], side: "current" | "proposed"): ReactNode[] {
  return segments.flatMap((seg, idx) => {
    if (seg.type === "equal") {
      return <span key={idx}>{seg.text}</span>;
    }
    if (seg.type === "removed" && side === "current") {
      return (
        <span key={idx} className="bg-destructive/30 rounded-xs">
          {seg.text}
        </span>
      );
    }
    if (seg.type === "added" && side === "proposed") {
      return (
        <span key={idx} className="bg-chart-2/30 rounded-xs">
          {seg.text}
        </span>
      );
    }
    // Skip removed segments on proposed side and added segments on current side
    return [];
  });
}

function DiffComparison({ current, proposed }: { current: string; proposed: string }) {
  const segments = diffChars(current, proposed);
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="space-y-1">
        <span className="text-muted-foreground text-xs font-medium">Current</span>
        <pre className="bg-destructive/10 rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
          {renderDiffSide(segments, "current")}
        </pre>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground text-xs font-medium">Proposed</span>
        <pre className="bg-chart-2/10 rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
          {renderDiffSide(segments, "proposed")}
        </pre>
      </div>
    </div>
  );
}

const fieldLabels: Record<string, string> = {
  correctedRulesText: "Errata Rules",
  correctedEffectText: "Errata Effect",
  printedRulesText: "Printed Rules",
  printedEffectText: "Printed Effect",
  flavorText: "Flavor Text",
};

export function TypographyReviewPage() {
  const { data } = useTypographyReview();
  const accept = useAcceptTypographyFix();

  if (data.diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">All text fields have correct typography.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {String(data.diffs.length)} {data.diffs.length === 1 ? "mismatch" : "mismatches"} found
        </p>
      </div>

      <div className="divide-y rounded-lg border">
        {data.diffs.map((diff) => {
          const key = `${diff.entity}-${diff.id}-${diff.field}`;
          return (
            <div key={key} className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{diff.name}</span>
                  <Badge variant="outline">{fieldLabels[diff.field] ?? diff.field}</Badge>
                  <Badge variant="secondary">{diff.entity}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={accept.isPending}
                  onClick={() =>
                    accept.mutate({
                      entity: diff.entity,
                      id: diff.id,
                      field: diff.field,
                      proposed: diff.proposed,
                    })
                  }
                >
                  <CheckIcon className="size-3.5" />
                  Accept
                </Button>
              </div>

              <DiffComparison current={diff.current} proposed={diff.proposed} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
