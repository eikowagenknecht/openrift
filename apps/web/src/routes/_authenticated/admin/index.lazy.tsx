import { createLazyFileRoute } from "@tanstack/react-router";

import { formatRelativeTime, useCronStatus } from "@/components/admin/refresh-actions";
import type { CronStatus } from "@/components/admin/refresh-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardmarketExpansions } from "@/hooks/use-cardmarket-expansions";
import { useSets } from "@/hooks/use-sets";
import { useTcgplayerGroups } from "@/hooks/use-tcgplayer-groups";

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

function ScheduleCard({
  label,
  cronKey,
  cronStatus,
}: {
  label: string;
  cronKey: keyof CronStatus;
  cronStatus?: CronStatus;
}) {
  const entry = cronStatus?.[cronKey];
  const nextRun = entry?.nextRun;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-sm font-medium">
          {nextRun ? formatRelativeTime(nextRun) : "No schedule"}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function AdminOverviewPage() {
  const { data: cronStatus } = useCronStatus();
  const { data: setsData, isLoading: setsLoading } = useSets();
  const { data: tcgData, isLoading: tcgLoading } = useTcgplayerGroups();
  const { data: cmData, isLoading: cmLoading } = useCardmarketExpansions();

  const sets = setsData?.sets ?? [];
  const totalCards = sets.reduce((sum, s) => sum + s.cardCount, 0);
  const totalPrintings = sets.reduce((sum, s) => sum + s.printingCount, 0);

  const tcgGroups = tcgData?.groups ?? [];
  const tcgMapped = tcgGroups.filter((g) => g.setId !== null).length;
  const tcgAssigned = tcgGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const tcgStaged = tcgGroups.reduce((sum, g) => sum + g.stagedCount, 0);

  const cmExpansions = cmData?.expansions ?? [];
  const cmMapped = cmExpansions.filter((e) => e.setId !== null).length;
  const cmAssigned = cmExpansions.reduce((sum, e) => sum + e.assignedCount, 0);
  const cmStaged = cmExpansions.reduce((sum, e) => sum + e.stagedCount, 0);

  const isLoading = setsLoading || tcgLoading || cmLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">TCGplayer</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <StatCard
            title="Sets"
            value={`${tcgMapped} / ${tcgGroups.length}`}
            description="mapped to OpenRift sets"
          />
          <StatCard title="Products mapped" value={tcgAssigned} />
          <StatCard title="Products staged" value={tcgStaged} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Cardmarket</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <StatCard
            title="Sets"
            value={`${cmMapped} / ${cmExpansions.length}`}
            description="mapped to OpenRift sets"
          />
          <StatCard title="Products mapped" value={cmAssigned} />
          <StatCard title="Products staged" value={cmStaged} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Next automatic refresh</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <ScheduleCard label="TCGplayer" cronKey="tcgplayer" cronStatus={cronStatus} />
          <ScheduleCard label="Cardmarket" cronKey="cardmarket" cronStatus={cronStatus} />
        </div>
      </section>
    </div>
  );
}
