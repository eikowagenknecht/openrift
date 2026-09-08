import { Link } from "@tanstack/react-router";
import { ChartBarIcon, SearchIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

export function StatsEmptyState() {
  return (
    <EmptyState
      className="py-20"
      icon={ChartBarIcon}
      title="No cards in collection yet"
      description="Browse the catalog and add cards to see statistics about your collection."
    >
      <Button variant="default" render={<Link to="/cards" />}>
        <SearchIcon />
        Browse cards
      </Button>
    </EmptyState>
  );
}
