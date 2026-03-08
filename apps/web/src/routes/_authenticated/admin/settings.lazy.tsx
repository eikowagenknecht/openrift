import { createLazyFileRoute } from "@tanstack/react-router";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminSettings } from "@/hooks/use-admin-settings";

export const Route = createLazyFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

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
    </div>
  );
}
