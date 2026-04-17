import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { LoaderIcon, TrashIcon } from "lucide-react";
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

export function CachePage() {
  const { data } = useCacheStatus();
  const purge = usePurgeCache();

  async function handlePurge() {
    try {
      await purge.mutateAsync();
      toast.success("Cloudflare cache purged");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Purge failed");
    }
  }

  return (
    <div className="space-y-4">
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
