import type { LucideIcon } from "lucide-react";
import {
  CopyIcon,
  DatabaseIcon,
  GalleryVerticalIcon,
  LayersIcon,
  SwordsIcon,
  UsersIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { UserGrowthChart } from "@/features/admin/components/user-growth-chart";
import { useAdminDashboard } from "@/features/admin/hooks/use-admin-dashboard";

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  caption?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-1.5">
          <Icon className="size-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        {caption !== undefined && <p className="text-muted-foreground text-xs">{caption}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data } = useAdminDashboard();
  const { app, signups } = data;

  return (
    <div className="space-y-4">
      <AdminPageTopBar title="Dashboard" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={UsersIcon}
          label="Users"
          value={app.totalUsers}
          caption={`+${app.recentSignups7d.toLocaleString()} in 7 days`}
        />
        <StatTile icon={GalleryVerticalIcon} label="Cards" value={app.totalCards} />
        <StatTile icon={CopyIcon} label="Printings" value={app.totalPrintings} />
        <StatTile icon={DatabaseIcon} label="Sets" value={app.totalSets} />
        <StatTile icon={LayersIcon} label="Collections" value={app.totalCollections} />
        <StatTile icon={SwordsIcon} label="Decks" value={app.totalDecks} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User growth</CardTitle>
        </CardHeader>
        <CardContent>
          <UserGrowthChart signups={signups} />
        </CardContent>
      </Card>
    </div>
  );
}
