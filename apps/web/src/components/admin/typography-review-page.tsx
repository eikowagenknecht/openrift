import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAcceptTypographyFix, useTypographyReview } from "@/hooks/use-typography-review";

const fieldLabels: Record<string, string> = {
  rulesText: "Rules Text",
  effectText: "Effect Text",
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

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium">Current</span>
                  <pre className="bg-destructive/10 rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
                    {diff.current}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium">Proposed</span>
                  <pre className="bg-chart-2/10 rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
                    {diff.proposed}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
