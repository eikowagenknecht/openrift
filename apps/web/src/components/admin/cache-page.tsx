import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { EraserIcon, LoaderIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCacheStatus, usePurgeCache } from "@/hooks/use-cache-purge";
import { useRefreshMatviews } from "@/hooks/use-refresh-matviews";
import { useClearSsrCache } from "@/hooks/use-status";

export function CachePage() {
  const { data } = useCacheStatus();
  const purge = usePurgeCache();
  const clearSsrCache = useClearSsrCache();
  const refreshMatviews = useRefreshMatviews();

  async function handlePurge() {
    try {
      await purge.mutateAsync();
      toast.success("Cloudflare cache purged");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Purge failed");
    }
  }

  async function handleRefreshMatviews() {
    try {
      await refreshMatviews.mutateAsync();
      toast.success("Materialized views refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>SSR Cache</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Clears the in-memory query cache the SSR layer uses to deduplicate API calls during a
            single render. Use this when you&apos;ve fixed bad data on the API and want
            server-rendered pages to pick up the change immediately instead of waiting for the cache
            TTL.
          </p>
          <Button
            variant="outline"
            onClick={() => clearSsrCache.mutate()}
            disabled={clearSsrCache.isPending}
          >
            {clearSsrCache.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <EraserIcon className="size-4" />
            )}
            {clearSsrCache.isSuccess ? "Cache Cleared" : "Clear SSR Cache"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Materialized Views</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Rebuilds the latest-prices and card-aggregates materialized views in Postgres. Cron
            normally keeps these in sync, but you can refresh them on demand after a manual price
            import or a fix that would otherwise leave stale aggregates around.
          </p>
          <Button
            variant="outline"
            onClick={handleRefreshMatviews}
            disabled={refreshMatviews.isPending}
          >
            {refreshMatviews.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            Refresh materialized views
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cloudflare Cache</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Purges everything cached by Cloudflare for this zone (HTML pages, API responses,
            images). Use this after deploying changes that affect cached URLs, or when fixing bad
            data that visitors may still see. The next request for each URL will re-fetch from the
            origin.
          </p>

          {data.configured ? (
            <AlertDialog>
              <AlertDialogTrigger
                disabled={purge.isPending}
                render={<Button variant="destructive" />}
              >
                {purge.isPending ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <TrashIcon className="size-4" />
                )}
                Purge Cloudflare cache
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Purge all Cloudflare cache?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every cached URL for this zone will be evicted. The next visitor to each page
                    will briefly see a slower response while the cache warms up again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogPrimitive.Close
                    render={<Button variant="destructive" />}
                    onClick={handlePurge}
                  >
                    Purge
                  </AlertDialogPrimitive.Close>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Cloudflare cache purging is not configured. Set{" "}
              <code className="font-mono">CLOUDFLARE_API_TOKEN</code> and{" "}
              <code className="font-mono">CLOUDFLARE_ZONE_ID</code> in the API environment to enable
              this button. The token needs the <strong>Zone.Cache Purge</strong> permission scoped
              to your zone.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
