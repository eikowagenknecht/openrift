import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export function AdminQueryShell<T>({
  query,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; error: Error | null };
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.error) {
    return <p className="text-sm text-destructive">Failed to load: {query.error.message}</p>;
  }

  if (!query.data) {
    return null;
  }

  return <>{children(query.data)}</>;
}
