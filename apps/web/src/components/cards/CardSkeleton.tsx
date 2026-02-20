import { Skeleton } from "@/components/ui/skeleton";

export function CardSkeleton() {
  return (
    <div className="w-full">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <div className="mt-1.5 space-y-1 px-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
