import {
  ActivityIcon,
  BugIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  LoaderIcon,
  RefreshCwIcon,
  SendIcon,
  ServerIcon,
  TagIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFlushPrintingEvents } from "@/hooks/use-flush-printing-events";
import { usePostChangelog } from "@/hooks/use-post-changelog";
import { useThrowInApi, useThrowInSsr } from "@/hooks/use-sentry-test";
import { useAdminStatus } from "@/hooks/use-status";

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

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
}

function LastRunBadge({ status }: { status: "running" | "succeeded" | "failed" }) {
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
  const { data, refetch, isFetching, dataUpdatedAt } = useAdminStatus();
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt).toLocaleTimeString());
    }
  }, [dataUpdatedAt]);

  if (!data) {
    return null;
  }

  const { server, database, cron, app, pricing } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Auto-refreshes every 30 seconds.{lastUpdated && ` Last updated ${lastUpdated}.`}
        </p>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
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
            {Object.entries(cron.jobs).map(([name, job]) => (
              <div key={name} className="py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">{name}</span>
                  <div className="flex items-center gap-2">
                    {job.enabled ? (
                      <span className="font-mono">
                        {job.nextRun ? formatRelativeTime(job.nextRun) : "idle"}
                      </span>
                    ) : (
                      <Badge variant="secondary">off</Badge>
                    )}
                    {name === "printingEvents" && <FlushPrintingEventsButton />}
                    {name === "changelog" && <PostChangelogButton />}
                  </div>
                </div>
                {job.lastRun && (
                  <div className="text-muted-foreground flex items-center justify-between pl-0">
                    <span>
                      last: {formatTimeAgo(job.lastRun.startedAt)}
                      {job.lastRun.durationMs !== null && (
                        <> · {formatDuration(job.lastRun.durationMs)}</>
                      )}
                    </span>
                    <LastRunBadge status={job.lastRun.status} />
                  </div>
                )}
                {job.lastRun?.status === "failed" && job.lastRun.errorMessage && (
                  <p className="text-red-600 dark:text-red-400">{job.lastRun.errorMessage}</p>
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
            <StatRow label="Total prices" value={formatNumber(pricing.totalPrices)} />
            {pricing.sources.map((source) => (
              <div key={source.marketplace} className="mt-2 first:mt-0">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-medium">{source.marketplace}</span>
                  <span className="font-mono text-sm">
                    {formatNumber(source.products)} products
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-sm">Price rows</span>
                  <span className="font-mono text-sm">{formatNumber(source.prices)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-sm">Latest price</span>
                  {source.latestPrice ? (
                    <span className="font-mono text-sm">{formatTimeAgo(source.latestPrice)}</span>
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

      <SentrySmokeTestCard />
    </div>
  );
}

// ── Sentry smoke test ──────────────────────────────────────────────────────
// Lets an admin fire a distinct test error on each surface so they can verify
// the event lands in the right Sentry project with the right tag. The errors
// are no-ops when Sentry is disabled (DSN unset); nothing else is side-affected.

function SentrySmokeTestCard() {
  const throwSsr = useThrowInSsr();
  const throwApi = useThrowInApi();

  function handleBrowser() {
    // setTimeout so React's error boundary doesn't intercept — the Sentry
    // browser integration hooks window.onerror, which catches uncaught
    // async errors and reports them with a full stack.
    setTimeout(() => {
      throw new Error(`Sentry smoke test (web-client) @ ${new Date().toISOString()}`);
    }, 0);
    toast.info("Thrown in browser — check openrift-ssr for service:web-client");
  }

  async function handleSsr() {
    try {
      await throwSsr.mutateAsync();
    } catch {
      toast.info("Thrown in SSR — check openrift-ssr for service:web-ssr");
      return;
    }
    toast.error("SSR throw returned successfully — did the server function run?");
  }

  async function handleApi() {
    try {
      await throwApi.mutateAsync();
    } catch {
      toast.info("Thrown in API — check openrift-api");
      return;
    }
    toast.error("API throw returned successfully — did the endpoint run?");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BugIcon className="text-muted-foreground size-4" />
          Sentry smoke test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Triggers a distinctly-tagged error on each surface so you can verify the event reaches
          Sentry. No-op when the DSN is unset. Each click creates a new issue (timestamp in
          message).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleBrowser}>
            <BugIcon />
            Throw in browser
          </Button>
          <Button variant="outline" onClick={handleSsr} disabled={throwSsr.isPending}>
            {throwSsr.isPending ? <LoaderIcon className="animate-spin" /> : <BugIcon />}
            Throw in SSR
          </Button>
          <Button variant="outline" onClick={handleApi} disabled={throwApi.isPending}>
            {throwApi.isPending ? <LoaderIcon className="animate-spin" /> : <BugIcon />}
            Throw in API
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Inline cron triggers ────────────────────────────────────────────────────

function FlushPrintingEventsButton() {
  const flush = useFlushPrintingEvents();

  async function handleFlush() {
    // Narrow the try to just the await — react-compiler doesn't support
    // logical/conditional value blocks inside a try/catch statement.
    let result: Awaited<ReturnType<typeof flush.mutateAsync>>;
    try {
      result = await flush.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Flush failed");
      return;
    }
    if (result.sent === 0 && result.failed === 0) {
      toast.success("No pending printing events");
    } else {
      toast.success(`Flushed ${result.sent} sent, ${result.failed} failed`);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={handleFlush}
      disabled={flush.isPending}
      title="Flush pending printing events to Discord now"
    >
      {flush.isPending ? (
        <LoaderIcon className="size-3.5 animate-spin" />
      ) : (
        <SendIcon className="size-3.5" />
      )}
    </Button>
  );
}

function PostChangelogButton() {
  const post = usePostChangelog();

  async function handlePost() {
    try {
      const result = await post.mutateAsync();
      if (result.posted) {
        toast.success(
          `Changelog posted to Discord (${result.count} ${result.count === 1 ? "entry" : "entries"})`,
        );
      } else {
        toast.success("No new entries to post");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Post failed");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={handlePost}
      disabled={post.isPending}
      title="Post pending changelog entries to Discord now"
    >
      {post.isPending ? (
        <LoaderIcon className="size-3.5 animate-spin" />
      ) : (
        <SendIcon className="size-3.5" />
      )}
    </Button>
  );
}
