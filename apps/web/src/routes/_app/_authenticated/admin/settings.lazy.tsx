import { useMutation } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { client, rpc } from "@/lib/rpc-client";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/settings")({
  component: SettingsPage,
});

function useFixTypography(dryRun: boolean) {
  return useMutation({
    mutationFn: (): Promise<{ affectedCount: number }> =>
      rpc(client.api.v1.admin["fix-typography"].$post({ json: { dryRun } })),
  });
}

function SettingsPage() {
  const { settings, update } = useAdminSettings();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Developer Tools</h2>
          <p className="text-sm text-muted-foreground">
            Diagnostic overlays and debugging aids. These settings are stored in your browser.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="debug-overlay">Debug overlay</Label>
            <p className="text-sm text-muted-foreground">
              Show card grid layout metrics (row heights, column count, virtualizer state)
            </p>
          </div>
          <Switch
            id="debug-overlay"
            checked={settings.debugOverlay}
            onCheckedChange={(checked: boolean) => update({ debugOverlay: checked })}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Data Maintenance</h2>
          <p className="text-sm text-muted-foreground">
            Bulk operations on the database. These actions affect all users.
          </p>
        </div>
        <FixTypographyCard />
      </section>
    </div>
  );
}

function FixTypographyCard() {
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  const preview = useFixTypography(true);
  const apply = useFixTypography(false);

  function handlePreview() {
    setApplied(false);
    preview.mutate(undefined, {
      onSuccess: (data) => {
        setPreviewCount(data.affectedCount);
      },
    });
  }

  function handleApply() {
    apply.mutate(undefined, {
      onSuccess: (data) => {
        setPreviewCount(data.affectedCount);
        setApplied(true);
      },
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-0.5">
        <Label>Fix typography</Label>
        <p className="text-sm text-muted-foreground">
          Replace straight quotes, triple dots, and hyphens before digits with proper Unicode
          characters, and ensure parenthesized text is wrapped with underscores for italic
          rendering, in all printing text fields.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" disabled={preview.isPending} onClick={handlePreview}>
          {preview.isPending ? "Checking\u2026" : "Preview"}
        </Button>

        {previewCount !== null && !applied && (
          <>
            <span className="text-sm text-muted-foreground">
              {previewCount === 0
                ? "No rows need fixing."
                : `${String(previewCount)} row${previewCount === 1 ? "" : "s"} would be updated.`}
            </span>
            {previewCount > 0 && (
              <Button size="sm" disabled={apply.isPending} onClick={handleApply}>
                {apply.isPending ? "Applying\u2026" : "Apply"}
              </Button>
            )}
          </>
        )}

        {applied && (
          <span className="text-sm text-green-600 dark:text-green-400">
            Done — {String(previewCount)} row{previewCount === 1 ? "" : "s"} updated.
          </span>
        )}
      </div>

      {(preview.isError || apply.isError) && (
        <p className="text-sm text-destructive">
          {(preview.error ?? apply.error)?.message ?? "Something went wrong."}
        </p>
      )}
    </div>
  );
}
