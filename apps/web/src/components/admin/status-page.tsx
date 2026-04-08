import {
  ActivityIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  EraserIcon,
  RefreshCwIcon,
  ServerIcon,
  TagIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminStatus, useClearSsrCache } from "@/hooks/use-status";

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatRelativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) {
    return `in ${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  return `in ${hours}h`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

export function StatusPage() {
  const { data, refetch, isFetching } = useAdminStatus();
  const clearCache = useClearSsrCache();

  if (!data) {
    return null;
  }

  const { server, database, cron, app, pricing } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Auto-refreshes every 30 seconds. Last updated {new Date().toLocaleTimeString()}.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => clearCache.mutate()}
            disabled={clearCache.isPending}
          >
            <EraserIcon />
            {clearCache.isSuccess ? "Cache Cleared" : "Clear SSR Cache"}
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Server */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerIcon className="text-muted-foreground size-4" />
              Server
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <StatRow label="Uptime" value={formatUptime(server.uptimeSeconds)} />
            <StatRow label="Environment" value={server.environment} />
            <StatRow label="Bun" value={`v${server.bunVersion}`} />
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CpuIcon className="text-muted-foreground size-4" />
              Memory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <StatRow label="RSS" value={`${server.memoryMb.rss} MB`} />
            <StatRow label="Heap used" value={`${server.memoryMb.heapUsed} MB`} />
            <StatRow label="Heap total" value={`${server.memoryMb.heapTotal} MB`} />
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseIcon className="text-muted-foreground size-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge variant={database.status === "connected" ? "default" : "destructive"}>
                {database.status}
              </Badge>
            </div>
            {database.sizeMb !== null && <StatRow label="Size" value={`${database.sizeMb} MB`} />}
            {database.activeConnections !== null && (
              <StatRow label="Connections" value={database.activeConnections} />
            )}
            <StatRow label="Migrations" value={database.totalMigrations} />
            {database.latestMigration && (
              <div className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted-foreground shrink-0 text-sm">Latest</span>
                <span className="truncate font-mono" title={database.latestMigration}>
                  {database.latestMigration}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cron Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="text-muted-foreground size-4" />
              Cron Jobs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground text-sm">Enabled</span>
              <Badge variant={cron.enabled ? "default" : "secondary"}>
                {cron.enabled ? "yes" : "no"}
              </Badge>
            </div>
            {Object.entries(cron.jobs).map(([name, job]) => (
              <div key={name} className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground text-sm">{name}</span>
                {job.enabled ? (
                  <span className="font-mono">
                    {job.nextRun ? formatRelativeTime(job.nextRun) : "idle"}
                  </span>
                ) : (
                  <Badge variant="secondary">off</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* App Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ActivityIcon className="text-muted-foreground size-4" />
              Application
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <StatRow label="Users" value={formatNumber(app.totalUsers)} />
            <StatRow label="Signups (7d)" value={formatNumber(app.recentSignups7d)} />
            <StatRow label="Cards" value={formatNumber(app.totalCards)} />
            <StatRow label="Printings" value={formatNumber(app.totalPrintings)} />
            <StatRow label="Sets" value={formatNumber(app.totalSets)} />
            <StatRow label="Collections" value={formatNumber(app.totalCollections)} />
            <StatRow label="Decks" value={formatNumber(app.totalDecks)} />
            <StatRow label="Copies" value={formatNumber(app.totalCopies)} />
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TagIcon className="text-muted-foreground size-4" />
              Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <StatRow label="Total snapshots" value={formatNumber(pricing.totalSnapshots)} />
            {pricing.sources.map((source) => (
              <div key={source.marketplace} className="mt-2 first:mt-0">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-medium">{source.marketplace}</span>
                  <span className="font-mono text-sm">
                    {formatNumber(source.products)} products
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-sm">Snapshots</span>
                  <span className="font-mono text-sm">{formatNumber(source.snapshots)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-sm">Latest price</span>
                  {source.latestSnapshot ? (
                    <span className="font-mono text-sm">
                      {formatTimeAgo(source.latestSnapshot)}
                    </span>
                  ) : (
                    <Badge variant="secondary">none</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-sm">Staging rows</span>
                  <span className="font-mono text-sm">{formatNumber(source.stagingRows)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-sm">Latest staging</span>
                  {source.latestStaging ? (
                    <span className="font-mono text-sm">{formatTimeAgo(source.latestStaging)}</span>
                  ) : (
                    <Badge variant="secondary">none</Badge>
                  )}
                </div>
              </div>
            ))}
            {pricing.sources.length === 0 && (
              <p className="text-muted-foreground text-sm">No marketplace data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
