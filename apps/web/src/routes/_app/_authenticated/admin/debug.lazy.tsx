import { createLazyFileRoute } from "@tanstack/react-router";

import {
  SectionHeader,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { useAdminSettingsStore } from "@/features/admin/hooks/use-admin-settings";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/debug")({
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useAdminSettingsStore((s) => s.settings);
  const update = useAdminSettingsStore((s) => s.update);

  return (
    <div className="space-y-8">
      <AdminPageTopBar title="Settings" />
      <section className="space-y-4">
        <SectionHeader>
          <SectionHeaderGroup>
            <SectionHeaderTitle level={2}>Developer Tools</SectionHeaderTitle>
            <SectionHeaderDescription>
              Diagnostic overlays and debugging aids. These settings are stored in your browser.
            </SectionHeaderDescription>
          </SectionHeaderGroup>
        </SectionHeader>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="debug-overlay">Debug overlay</Label>
            <p className="text-muted-foreground text-sm">
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
