import type { RegenerateImagesCheckpoint, RehostImageResponse } from "@openrift/shared";
import { regenerateImagesCheckpointSchema } from "@openrift/shared/contracts/admin/job-results";
import { Link } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { ConfirmClearButton } from "@/components/admin/confirm-clear-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useLatestJobRunByKind } from "@/hooks/use-job-runs";
import {
  useBrokenImages,
  useCancelRegenerateImages,
  useCleanupOrphaned,
  useClearRehosted,
  useLowResImages,
  useMigrateDirectories,
  useMissingImages,
  useRegenerateImages,
  useRehostImages,
  useRehostStatus,
  useUnrehostImages,
} from "@/hooks/use-rehost";

const REGENERATE_KIND = "images.regenerate";

/**
 * Type guard for reading `job_runs.result` (typed `unknown`) as a checkpoint.
 * Backed by the shared schema, so the guard and the type can't drift.
 * @returns True when the value matches the checkpoint schema.
 */
function isRegenerateCheckpoint(value: unknown): value is RegenerateImagesCheckpoint {
  return regenerateImagesCheckpointSchema.safeParse(value).success;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;
const BYTES_PER_UNIT = 1024;
const MAX_DISPLAYED_ERRORS = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const i = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT));
  const value = bytes / BYTES_PER_UNIT ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${BYTE_UNITS[i]}`;
}

// ── MutationStatus ────────────────────────────────────────────────────────────

function MutationStatus({
  mutation,
  label,
}: {
  mutation: {
    isSuccess: boolean;
    isError: boolean;
    data?: RehostImageResponse;
    error?: Error | null;
  };
  label: string;
}) {
  if (mutation.isSuccess && mutation.data) {
    const d = mutation.data;
    const count = d.rehosted;
    const total = d.total;
    const errors = d.errors;
    const verb = label === "rehost" ? "Rehosted" : "Regenerated";
    return (
      <div>
        <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
          <CheckIcon className="size-4" />
          {verb} {count} / {total} images
        </p>
        {errors.length > 0 && (
          <ul className="mt-1 ml-5 list-disc text-red-600 dark:text-red-400">
            {errors.slice(0, MAX_DISPLAYED_ERRORS).map((err) => (
              <li key={err}>{err}</li>
            ))}
            {errors.length > MAX_DISPLAYED_ERRORS && (
              <li>...and {errors.length - MAX_DISPLAYED_ERRORS} more</li>
            )}
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

/**
 * Status block for the regenerate-images job, driven by the polled job_runs
 * row rather than client-side mutation state, so it survives a tab refresh.
 * @returns Progress bar plus per-status detail line, or null when there's
 *   nothing to show.
 */
function RegenerateJobStatus({
  run,
}: {
  run: { status: "running" | "succeeded" | "failed"; errorMessage: string | null; result: unknown };
}) {
  const checkpoint = isRegenerateCheckpoint(run.result) ? run.result : null;
  if (!checkpoint) {
    if (run.status === "failed") {
      return (
        <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
          <XIcon className="size-4" />
          {run.errorMessage ?? "Regenerate failed"}
        </p>
      );
    }
    return null;
  }

  const pct =
    checkpoint.totalFiles > 0
      ? Math.round((checkpoint.processed / checkpoint.totalFiles) * 100)
      : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>
          {checkpoint.processed} / {checkpoint.totalFiles} processed
          {run.status === "running" && checkpoint.cancelRequested && " · cancelling…"}
          {run.status === "failed" &&
            (checkpoint.cancelRequested ? " · cancelled" : ` · failed: ${run.errorMessage ?? ""}`)}
          {run.status === "succeeded" &&
            ` · regenerated ${checkpoint.regenerated}, failed ${checkpoint.failed}`}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} />
      <ErrorsList errors={checkpoint.errors} />
    </div>
  );
}

function SimpleMutationResult<T>({
  mutation,
  renderSuccess,
}: {
  mutation: { isSuccess: boolean; isError: boolean; data?: T; error?: Error | null };
  renderSuccess: (data: T) => React.ReactNode;
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
    <ul className="mt-1 ml-5 list-disc text-red-600 dark:text-red-400">
      {errors.slice(0, MAX_DISPLAYED_ERRORS).map((err) => (
        <li key={err}>{err}</li>
      ))}
      {errors.length > MAX_DISPLAYED_ERRORS && (
        <li>...and {errors.length - MAX_DISPLAYED_ERRORS} more</li>
      )}
    </ul>
  );
}

// ── Manage Rehosted Images ───────────────────────────────────────────────────

function ManageSection() {
  const { data: status, refetch } = useRehostStatus();
  const { data: latestRegenRun } = useLatestJobRunByKind(REGENERATE_KIND);

  const rehostMutation = useRehostImages(() => refetch());
  const regenMutation = useRegenerateImages();
  const cancelRegenMutation = useCancelRegenerateImages();
  const clearMutation = useClearRehosted();
  const cleanupMutation = useCleanupOrphaned();
  const migrateMutation = useMigrateDirectories();

  if (!status) {
    return null;
  }

  const pct = status.total > 0 ? (status.rehosted / status.total) * 100 : 0;
  const allDone = status.external === 0;
  const totalFiles = status.disk.sets.reduce((sum, s) => sum + s.fileCount, 0);
  const regenRunning = latestRegenRun?.status === "running";
  // A failed run with unprocessed items is auto-resumable from the server side;
  // surface that as a "Resume" label so the user knows what'll happen.
  const resumableCheckpoint =
    latestRegenRun?.status === "failed" && isRegenerateCheckpoint(latestRegenRun.result)
      ? latestRegenRun.result
      : null;
  const canResume =
    resumableCheckpoint !== null &&
    resumableCheckpoint.lastProcessedIndex < resumableCheckpoint.totalFiles - 1;
  const anyPending =
    rehostMutation.isPending ||
    regenMutation.isPending ||
    cancelRegenMutation.isPending ||
    clearMutation.isPending ||
    cleanupMutation.isPending ||
    migrateMutation.isPending ||
    regenRunning;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Manage Rehosted Images</CardTitle>
        <CardDescription>
          {status.rehosted} / {status.total} images rehosted
          {status.disk.totalBytes > 0 &&
            ` · ${totalFiles} files · ${formatBytes(status.disk.totalBytes)}`}
          {status.disk.byResolution.length > 0 && (
            <>
              {" · "}
              {status.disk.byResolution
                .map((r) => `${r.resolution}: ${r.fileCount} / ${formatBytes(r.bytes)}`)
                .join(", ")}
            </>
          )}
          {status.orphanedFiles > 0 && ` · ${status.orphanedFiles} orphaned`}
        </CardDescription>
        <Progress value={pct} className="h-1.5" />
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* ── Action buttons ────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={anyPending || migrateMutation.isSuccess}
            onClick={() => migrateMutation.mutate()}
          >
            {migrateMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Migrate directories"
            )}
          </Button>
          <Button
            variant="outline"
            disabled={anyPending || !status.disk.totalBytes}
            onClick={() => regenMutation.mutate({ skipExisting: true, reset: true })}
          >
            {regenMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Fill missing variants"
            )}
          </Button>
          <Button
            variant="outline"
            disabled={anyPending || !status.disk.totalBytes}
            onClick={() => regenMutation.mutate({})}
          >
            {regenRunning ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : resumableCheckpoint && canResume ? (
              `Resume regeneration (${resumableCheckpoint.lastProcessedIndex + 1}/${resumableCheckpoint.totalFiles})`
            ) : (
              "Regenerate resolutions"
            )}
          </Button>
          {canResume && (
            <Button
              variant="outline"
              disabled={anyPending || !status.disk.totalBytes}
              onClick={() => regenMutation.mutate({ reset: true })}
            >
              Start fresh
            </Button>
          )}
          {regenRunning && (
            <Button
              variant="outline"
              disabled={cancelRegenMutation.isPending}
              onClick={() => cancelRegenMutation.mutate()}
            >
              {cancelRegenMutation.isPending ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                "Cancel regeneration"
              )}
            </Button>
          )}
          <Button disabled={anyPending || allDone} onClick={() => rehostMutation.mutate()}>
            {rehostMutation.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Rehost missing"
            )}
          </Button>
          <Button
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
        {latestRegenRun && <RegenerateJobStatus run={latestRegenRun} />}

        {migrateMutation.isSuccess && migrateMutation.data && (
          <div>
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Scanned {migrateMutation.data.scanned} files: {migrateMutation.data.moved} moved,{" "}
              {migrateMutation.data.skipped} skipped
              {migrateMutation.data.failed > 0 && `, ${migrateMutation.data.failed} failed`}
            </p>
            <ErrorsList errors={migrateMutation.data.errors} />
          </div>
        )}
        {migrateMutation.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {migrateMutation.error?.message}
          </p>
        )}

        <MutationStatus mutation={rehostMutation} label="rehost" />
        {regenMutation.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {regenMutation.error?.message}
          </p>
        )}
        {cancelRegenMutation.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {cancelRegenMutation.error?.message}
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

// ── MissingImagesSection ──────────────────────────────────────────────────────

function MissingImagesSection() {
  const { data: cards } = useMissingImages();

  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Missing Images</CardTitle>
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
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading } = useBrokenImages(enabled);
  const unrehostMutation = useUnrehostImages();

  if (!enabled) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Broken Images</CardTitle>
            <Button variant="outline" onClick={() => setEnabled(true)}>
              Check
            </Button>
          </div>
          <CardDescription>Scan disk for rehosted images with missing files.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Broken Images</CardTitle>
          <CardDescription>Scanning disk for missing files…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data || data.broken.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Broken Images</CardTitle>
          <CardDescription>No broken images found.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const bySet = new Map<string, typeof data.broken>();
  for (const entry of data.broken) {
    const list = bySet.get(entry.setSlug) ?? [];
    list.push(entry);
    bySet.set(entry.setSlug, list);
  }

  const imageIds = data.broken.map((entry) => entry.imageId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Broken Images</CardTitle>
          <ConfirmClearButton
            label="Un-rehost all"
            title={`Un-rehost ${data.broken.length} broken ${data.broken.length === 1 ? "image" : "images"}?`}
            description="Clears the rehosted URL on each image so the next Rehost missing run re-downloads and regenerates them from the original source."
            onConfirm={() => unrehostMutation.mutate(imageIds)}
            disabled={unrehostMutation.isPending}
            isPending={unrehostMutation.isPending}
          />
        </div>
        <CardDescription>
          {data.broken.length} of {data.total} rehosted{" "}
          {data.broken.length === 1 ? "image is" : "images are"} missing files on disk.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {unrehostMutation.isSuccess && unrehostMutation.data && (
          <div className="mb-3">
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Un-rehosted {unrehostMutation.data.unrehosted} / {unrehostMutation.data.total} images
            </p>
            <ErrorsList errors={unrehostMutation.data.errors} />
          </div>
        )}
        {unrehostMutation.isError && (
          <p className="mb-3 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {unrehostMutation.error?.message}
          </p>
        )}
        <div className="space-y-3">
          {[...bySet.entries()].map(([setSlug, entries]) => (
            <div key={setSlug}>
              <p className="text-muted-foreground mb-1 font-medium uppercase">{setSlug}</p>
              <ul className="space-y-1 text-sm">
                {entries.map((entry) => (
                  <li key={entry.imageId} className="flex items-baseline gap-2">
                    <Link
                      to="/admin/cards/$cardSlug"
                      params={{ cardSlug: entry.cardSlug }}
                      className="hover:underline"
                    >
                      <span className="text-muted-foreground/60">{entry.printingShortCode}</span>{" "}
                      {entry.cardName}
                    </Link>
                    <span className="text-muted-foreground truncate">{entry.rehostedUrl}</span>
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

// ── LowResImagesSection ───────────────────────────────────────────────────────

function LowResImagesSection() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading } = useLowResImages(enabled);

  if (!enabled) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Low-Resolution Images</CardTitle>
            <Button variant="outline" onClick={() => setEnabled(true)}>
              Check
            </Button>
          </div>
          <CardDescription>
            Scan rehosted images for any whose source short edge is under 400px.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Low-Resolution Images</CardTitle>
          <CardDescription>Scanning image dimensions…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data || data.lowRes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Low-Resolution Images</CardTitle>
          <CardDescription>No low-resolution images found.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Group by set for readability
  const bySet = new Map<string, typeof data.lowRes>();
  for (const entry of data.lowRes) {
    const list = bySet.get(entry.setSlug) ?? [];
    list.push(entry);
    bySet.set(entry.setSlug, list);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Low-Resolution Images</CardTitle>
        <CardDescription>
          {data.lowRes.length} of {data.total} rehosted{" "}
          {data.lowRes.length === 1 ? "image has" : "images have"} a full-resolution width under
          600px.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {[...bySet.entries()].map(([setSlug, entries]) => (
            <div key={setSlug}>
              <p className="text-muted-foreground mb-1 font-medium uppercase">{setSlug}</p>
              <ul className="space-y-1 text-sm">
                {entries.map((entry) => (
                  <li key={entry.imageId} className="flex items-baseline gap-2">
                    <Link
                      to="/admin/cards/$cardSlug"
                      params={{ cardSlug: entry.cardSlug }}
                      className="hover:underline"
                    >
                      <span className="text-muted-foreground/60">{entry.printingShortCode}</span>{" "}
                      {entry.cardName}
                    </Link>
                    <span className="text-muted-foreground">
                      {entry.width}×{entry.height}
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
      <LowResImagesSection />
      <MissingImagesSection />
      <ManageSection />
    </div>
  );
}
