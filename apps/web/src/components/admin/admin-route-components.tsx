import { InlineError } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminPending() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function AdminError({ error }: { error: Error }) {
  return <InlineError message={`Failed to load: ${error.message}`} />;
}
