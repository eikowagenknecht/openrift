import type { RehostImageResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { ConfirmClearButton } from "@/components/admin/confirm-clear-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useProviderNames } from "@/hooks/use-candidates";
import type { RegenerateAccumulator } from "@/hooks/use-rehost";
import {
  useBrokenImages,
  useCleanupOrphaned,
  useClearRehosted,
  useMissingImages,
  useRegenerateImages,
  useRehostImages,
  useRehostStatus,
  useRenameImages,
  useRenamePreview,
  useRestoreImageUrls,
} from "@/hooks/use-rehost";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

// ── MutationStatus ────────────────────────────────────────────────────────────

function MutationStatus({
  mutation,
  label,
}: {
  mutation: {
    isSuccess: boolean;
    isError: boolean;
    data?: RehostImageResponse | RegenerateAccumulator;
    error?: Error | null;
  };
  label: string;
}) {
  if (mutation.isSuccess && mutation.data) {
    const d = mutation.data;
    const count = "rehosted" in d ? d.rehosted : "regenerated" in d ? d.regenerated : 0;
    const total = "total" in d ? d.total : 0;
    const errors = d.errors;
    const verb = label === "rehost" ? "Rehosted" : "Regenerated";
    return (
      <div>
        <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
          <CheckIcon className="size-4" />
          {verb} {count} / {total} images
        </p>
        {errors.length > 0 && (
          <ul className="ml-5 mt-1 list-disc text-xs text-red-600 dark:text-red-400">
            {errors.slice(0, 5).map((err) => (
              <li key={err}>{err}</li>
            ))}
            {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
          </ul>
        )}
      </div>
    );
  }
  if (mutation.isError) {
    return (
      <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
        <XIcon className="size-4" />
        {mutation.error?.message}
      </p>
    );
  }
  return null;
}

function SimpleMutationResult({
  mutation,
  renderSuccess,
}: {
  mutation: { isSuccess: boolean; isError: boolean; data?: unknown; error?: Error | null };
  renderSuccess: (data: any) => React.ReactNode;
}) {
  if (mutation.isSuccess && mutation.data) {
    return (
      <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <CheckIcon className="size-4" />
        {renderSuccess(mutation.data)}
      </p>
    );
  }
  if (mutation.isError) {
    return (
      <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
        <XIcon className="size-4" />
        {mutation.error?.message}
      </p>
    );
  }
  return null;
}

function ErrorsList({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <ul className="ml-5 mt-1 list-disc text-xs text-red-600 dark:text-red-400">
      {errors.slice(0, 5).map((err) => (
        <li key={err}>{err}</li>
      ))}
      {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
    </ul>
  );
}

// ── Manage Rehosted Images ───────────────────────────────────────────────────

function ManageSection() {
  const { data: status, refetch } = useRehostStatus();
  const { data: preview } = useRenamePreview();

  const [regenProgress, setRegenProgress] = useState<{
    processed: number;
    totalFiles: number;
  } | null>(null);

  const rehostMutation = useRehostImages(() => refetch());
  const regenMutation = useRegenerateImages((processed, totalFiles) => {
    setRegenProgress({ processed, totalFiles });
  });
  const clearMutation = useClearRehosted();
  const renameMutation = useRenameImages();
  const cleanupMutation = useCleanupOrphaned();

  if (!status) {
    return null;
  }

  const pct = status.total > 0 ? (status.rehosted / status.total) * 100 : 0;
  const allDone = status.external === 0;
  const totalFiles = status.disk.sets.reduce((sum, s) => sum + s.fileCount, 0);
  const anyPending =
    rehostMutation.isPending ||
    regenMutation.isPending ||
    clearMutation.isPending ||
    renameMutation.isPending ||
    cleanupMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Manage Rehosted Images</CardTitle>
        <CardDescription>
          {status.rehosted} / {status.total} images rehosted
          {status.disk.totalBytes > 0 &&
            ` · ${totalFiles} files · ${formatBytes(status.disk.totalBytes)}`}
          {preview && preview.misnamed > 0 && ` · ${preview.misnamed} stale`}
          {status.orphanedFiles > 0 && ` · ${status.orphanedFiles} orphaned`}
        </CardDescription>
        <Progress value={pct} className="h-1.5" />
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* ── Action buttons ────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={anyPending || !preview?.misnamed}
            onClick={() => renameMutation.mutate()}
          >
            {renameMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Rename stale"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={anyPending || !status.disk.totalBytes}
            onClick={() =>
              regenMutation.mutate(undefined, {
                onSuccess: () => setRegenProgress(null),
              })
            }
          >
            {regenMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Regenerate resolutions"
            )}
          </Button>
          <Button
            size="sm"
            disabled={anyPending || allDone}
            onClick={() => rehostMutation.mutate()}
          >
            {rehostMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Rehost missing"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={anyPending || !status.orphanedFiles}
            onClick={() => cleanupMutation.mutate()}
          >
            {cleanupMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Delete orphaned"
            )}
          </Button>
          <ConfirmClearButton
            title="Delete all rehosted images?"
            description="This will delete all locally cached images. They can be re-fetched by running rehost again."
            onConfirm={() => clearMutation.mutate()}
            disabled={anyPending || !status.rehosted}
            isPending={clearMutation.isPending}
          />
        </div>

        {/* ── Progress / results ─────────────────────────────────────── */}
        {regenProgress && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {regenProgress.processed} / {regenProgress.totalFiles} processed
              </span>
              <span className="text-muted-foreground">
                {Math.round((regenProgress.processed / regenProgress.totalFiles) * 100)}%
              </span>
            </div>
            <Progress value={(regenProgress.processed / regenProgress.totalFiles) * 100} />
          </div>
        )}

        <MutationStatus mutation={rehostMutation} label="rehost" />
        <MutationStatus mutation={regenMutation} label="regenerate" />

        {renameMutation.isSuccess && renameMutation.data && (
          <div>
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Scanned {renameMutation.data.scanned} images: {renameMutation.data.renamed} renamed,{" "}
              {renameMutation.data.alreadyCorrect} already correct
              {renameMutation.data.failed > 0 && `, ${renameMutation.data.failed} failed`}
            </p>
            <ErrorsList errors={renameMutation.data.errors} />
          </div>
        )}
        {renameMutation.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {renameMutation.error?.message}
          </p>
        )}

        {cleanupMutation.isSuccess && cleanupMutation.data && (
          <div>
            <SimpleMutationResult
              mutation={cleanupMutation}
              renderSuccess={(d: { scanned: number; deleted: number }) =>
                `Scanned ${d.scanned} files, deleted ${d.deleted} orphaned`
              }
            />
            <ErrorsList errors={cleanupMutation.data.errors} />
          </div>
        )}
        {cleanupMutation.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {cleanupMutation.error?.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── RestoreUrlsSection ────────────────────────────────────────────────────────

function RestoreUrlsSection() {
  const { data: sourceNames } = useProviderNames();
  const [selectedSource, setSelectedSource] = useState<string>("");

  const restoreMutation = useRestoreImageUrls();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Restore Original URLs</CardTitle>
            <CardDescription>
              Backfill missing original URLs on active images from a card source. Run this before
              rehosting if images were lost.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select value={selectedSource} onValueChange={(v) => setSelectedSource(v ?? "")}>
              <SelectTrigger className="w-40" size="sm">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {sourceNames?.map((name: string) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedSource || restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(selectedSource)}
            >
              {restoreMutation.isPending ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                "Restore"
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {(restoreMutation.isSuccess || restoreMutation.isError) && (
        <CardContent className="pt-0">
          <SimpleMutationResult
            mutation={restoreMutation}
            renderSuccess={(d: { updated: number; provider: string }) => (
              <>
                Restored {d.updated} image URLs from &ldquo;{d.provider}&rdquo;
              </>
            )}
          />
        </CardContent>
      )}
    </Card>
  );
}

// ── MissingImagesSection ──────────────────────────────────────────────────────

function MissingImagesSection() {
  const { data: cards } = useMissingImages();

  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Missing Images</CardTitle>
        <CardDescription>
          {cards.length} {cards.length === 1 ? "card has" : "cards have"} printings without an
          active front-face image.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1 text-sm">
          {cards.map((card) => (
            <li key={card.cardId}>
              <Link
                to="/admin/cards/$cardSlug"
                params={{ cardSlug: card.slug }}
                className="text-muted-foreground hover:underline"
              >
                <span className="text-muted-foreground/60">{card.slug}</span> {card.name}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── BrokenImagesSection ──────────────────────────────────────────────────────

function BrokenImagesSection() {
  const { data, isLoading } = useBrokenImages();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Broken Images</CardTitle>
          <CardDescription>Scanning disk for missing files…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data || data.broken.length === 0) {
    return null;
  }

  // Group by set for readability
  const bySet = new Map<string, typeof data.broken>();
  for (const entry of data.broken) {
    const list = bySet.get(entry.setSlug) ?? [];
    list.push(entry);
    bySet.set(entry.setSlug, list);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Broken Images</CardTitle>
        <CardDescription>
          {data.broken.length} of {data.total} rehosted{" "}
          {data.broken.length === 1 ? "image is" : "images are"} missing files on disk.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {[...bySet.entries()].map(([setSlug, entries]) => (
            <div key={setSlug}>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">{setSlug}</p>
              <ul className="space-y-1 text-sm">
                {entries.map((entry) => (
                  <li key={entry.imageId} className="flex items-baseline gap-2">
                    <Link
                      to="/admin/cards/$cardSlug"
                      params={{ cardSlug: entry.cardSlug }}
                      className="hover:underline"
                    >
                      <span className="text-muted-foreground/60">{entry.printingSlug}</span>{" "}
                      {entry.cardName}
                    </Link>
                    <span className="text-muted-foreground truncate text-xs">
                      {entry.rehostedUrl}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ImagesPage() {
  return (
    <div className="space-y-4">
      <BrokenImagesSection />
      <MissingImagesSection />
      <ManageSection />
      <Separator />
      <RestoreUrlsSection />
    </div>
  );
}
