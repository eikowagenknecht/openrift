import { createLazyFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSets } from "@/hooks/use-sets";

export const Route = createLazyFileRoute("/_authenticated/admin/")({
  component: AdminOverviewPage,
});

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {description && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      )}
    </Card>
  );
}

function AdminOverviewPage() {
  const { data: setsData, isLoading } = useSets();

  const sets = setsData?.sets ?? [];
  const totalCards = sets.reduce((sum, s) => sum + s.cardCount, 0);
  const totalPrintings = sets.reduce((sum, s) => sum + s.printingCount, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Catalog</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <StatCard title="Sets" value={sets.length} />
          <StatCard title="Cards" value={totalCards} />
          <StatCard title="Printings" value={totalPrintings} />
        </div>
      </section>
    </div>
  );
}
