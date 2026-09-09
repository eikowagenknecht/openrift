import { Link } from "@tanstack/react-router";
import { CheckIcon, ClockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardSubmissionSummary } from "@/features/contribute/hooks/use-card-submission-summary";

export function YourSubmissionsCard({ className }: { className?: string }) {
  const { data, isPending } = useCardSubmissionSummary();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Your submissions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {isPending ? <Skeleton className="h-12 w-48" /> : null}
        {data ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ClockIcon className="text-warning size-4" />
              {data.pending} waiting for review
            </div>
            <div className="flex items-center gap-2">
              <CheckIcon className="text-success size-4" />
              {data.accepted} applied
            </div>
          </div>
        ) : null}
        <Button variant="outline" size="sm" render={<Link to="/contribute/submissions" />}>
          See all
        </Button>
      </CardContent>
    </Card>
  );
}
