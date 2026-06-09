import { Badge } from "@/components/ui/badge";

/**
 * Status pill for a job run: muted "running", red "failed", green "ok" for
 * anything else (succeeded). Shared by the job-runs and status admin pages.
 * @returns The status badge.
 */
export function JobStatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return <Badge variant="secondary">running</Badge>;
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-red-600 text-red-600 dark:text-red-400">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-600 text-green-600 dark:text-green-400">
      ok
    </Badge>
  );
}
