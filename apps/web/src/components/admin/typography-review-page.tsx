import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAcceptTypographyFix, useTypographyReview } from "@/hooks/use-typography-review";
import type { DiffSegment } from "@/lib/text-diff";
import { textDiff } from "@/lib/text-diff";

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
  const segments = textDiff(current, proposed, { granularity: "char" });
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="space-y-1">
        <span className="text-muted-foreground font-medium">Current</span>
        <pre className="bg-destructive/10 rounded-md p-2 font-mono whitespace-pre-wrap">
          {renderDiffSide(segments, "current")}
        </pre>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground font-medium">Proposed</span>
        <pre className="bg-chart-2/10 rounded-md p-2 font-mono whitespace-pre-wrap">
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
  name: "Card Name",
  tags: "Tags",
  printedName: "Printed Name",
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
