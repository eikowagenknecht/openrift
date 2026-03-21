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
import { useProviderNames } from "@/hooks/use-candidates";
import type { RegenerateAccumulator } from "@/hooks/use-rehost";
import {
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

// ── RehostSection ─────────────────────────────────────────────────────────────

function RehostSection() {
  const { data: status, refetch } = useRehostStatus();

  const [regenProgress, setRegenProgress] = useState<{
    processed: number;
    totalFiles: number;
  } | null>(null);

  const rehostMutation = useRehostImages(() => refetch());

  const regenMutation = useRegenerateImages((processed, totalFiles) => {
    setRegenProgress({ processed, totalFiles });
  });

  const clearMutation = useClearRehosted();

  if (!status) {
    return null;
  }

  const pct = status.total > 0 ? (status.rehosted / status.total) * 100 : 0;
  const allDone = status.external === 0;
  const anyPending = rehostMutation.isPending || regenMutation.isPending || clearMutation.isPending;
  const totalFiles = status.disk.sets.reduce((sum, s) => sum + s.fileCount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Rehosted Images</CardTitle>
            <CardDescription>
              {status.rehosted} / {status.total} images
              {status.disk.totalBytes > 0 &&
                ` · ${totalFiles} files · ${formatBytes(status.disk.totalBytes)}`}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <ConfirmClearButton
              title="Clear all rehosted images?"
              description="This will delete all locally cached images. They can be re-fetched by running rehost again."
              onConfirm={() => clearMutation.mutate()}
              disabled={anyPending || !status.rehosted}
              isPending={clearMutation.isPending}
            />
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
                "Regenerate"
              )}
            </Button>
            <Button
              size="sm"
              disabled={anyPending || allDone}
              onClick={() => rehostMutation.mutate()}
            >
              {rehostMutation.isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Rehost"}
            </Button>
          </div>
        </div>
        <Progress value={pct} className="h-1.5" />
      </CardHeader>
      {(regenProgress ||
        rehostMutation.isSuccess ||
        rehostMutation.isError ||
        regenMutation.isSuccess ||
        regenMutation.isError) && (
        <CardContent className="pt-0">
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
        </CardContent>
      )}
    </Card>
  );
}

// ── RenameSection ─────────────────────────────────────────────────────────────

function RenameSection() {
  const { data: preview } = useRenamePreview();
  const renameMutation = useRenameImages();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Rename Files</CardTitle>
            <CardDescription>
              {preview
                ? preview.misnamed > 0
                  ? `${preview.misnamed} / ${preview.total} rehosted images have stale filenames`
                  : `All ${preview.total} rehosted images have correct filenames`
                : "Checking for misnamed images\u2026"}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={renameMutation.isPending || !preview?.misnamed}
            onClick={() => renameMutation.mutate()}
          >
            {renameMutation.isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Rename"}
          </Button>
        </div>
      </CardHeader>
      {(renameMutation.isSuccess || renameMutation.isError) && (
        <CardContent className="pt-0">
          {renameMutation.isSuccess && renameMutation.data && (
            <div>
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckIcon className="size-4" />
                Scanned {renameMutation.data.scanned} images: {renameMutation.data.renamed} renamed,{" "}
                {renameMutation.data.alreadyCorrect} already correct
                {renameMutation.data.failed > 0 && `, ${renameMutation.data.failed} failed`}
              </p>
              {renameMutation.data.errors.length > 0 && (
                <ul className="ml-5 mt-1 list-disc text-xs text-red-600 dark:text-red-400">
                  {renameMutation.data.errors.slice(0, 5).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                  {renameMutation.data.errors.length > 5 && (
                    <li>...and {renameMutation.data.errors.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          {renameMutation.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {renameMutation.error?.message}
            </p>
          )}
        </CardContent>
      )}
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
          {restoreMutation.isSuccess && restoreMutation.data && (
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Restored {restoreMutation.data.updated} image URLs from &ldquo;
              {restoreMutation.data.provider}&rdquo;
            </p>
          )}
          {restoreMutation.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {restoreMutation.error?.message}
            </p>
          )}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export function ImagesPage() {
  return (
    <div className="space-y-4">
      <MissingImagesSection />
      <RehostSection />
      <RenameSection />
      <RestoreUrlsSection />
    </div>
  );
}
