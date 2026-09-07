import { Badge } from "@/components/ui/badge";

/**
 * Status pill for a job run: muted "running", red "failed", green "ok" for
 * anything else (succeeded).
 */
export function JobStatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return <Badge variant="secondary">running</Badge>;
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-success text-success">
      ok
    </Badge>
  );
}
