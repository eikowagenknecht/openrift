import type { FeatureFlagResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useCreateFeatureFlag,
  useDeleteFeatureFlag,
  useFeatureFlags,
  useToggleFeatureFlag,
} from "@/hooks/use-feature-flags";

interface FlagDraft {
  key: string;
  description: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;

export function FeatureFlagsPage() {
  const { data } = useFeatureFlags();
  const toggleMutation = useToggleFeatureFlag();
  const createMutation = useCreateFeatureFlag();
  const deleteMutation = useDeleteFeatureFlag();
  const { flags } = data;

  const columns: AdminColumnDef<FeatureFlagResponse, FlagDraft>[] = [
    {
      header: "Key",
      sortValue: (f) => f.key,
      cell: (f) => <span className="font-mono text-sm">{f.key}</span>,
      addCell: (d, set) => (
        <Input
          value={d.key}
          onChange={(e) => set((prev) => ({ ...prev, key: e.target.value.toLowerCase() }))}
          placeholder="deck-builder"
          className="h-8 w-48 font-mono"
        />
      ),
    },
    {
      header: "Description",
      cell: (f) =>
        f.description || (
          <span className="text-muted-foreground text-sm italic">No description</span>
        ),
      addCell: (d, set) => (
        <Input
          value={d.description}
          onChange={(e) => set((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="What this flag controls"
          className="h-8"
        />
      ),
    },
    {
      header: "Status",
      align: "center",
      width: "w-24",
      cell: (f) => (
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={f.enabled}
            onCheckedChange={(checked: boolean) =>
              toggleMutation.mutate({ key: f.key, enabled: checked })
            }
            disabled={toggleMutation.isPending}
          />
          <Badge variant={f.enabled ? "default" : "secondary"}>{f.enabled ? "On" : "Off"}</Badge>
        </div>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={flags}
      getRowKey={(f) => f.key}
      emptyText="No feature flags yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Feature flags take effect on the next page load for all users.
        </p>
      }
      add={{
        emptyDraft: { key: "", description: "" },
        onSave: (d) =>
          createMutation.mutateAsync({
            key: d.key.trim(),
            description: d.description.trim() || null,
          }),
        validate: (d) => {
          const key = d.key.trim();
          if (!key) {
            return "Key is required";
          }
          if (!KEBAB_RE.test(key)) {
            return "Key must be kebab-case (e.g. deck-builder)";
          }
          return null;
        },
        label: "Add Flag",
      }}
      delete={{
        onDelete: (f) => deleteMutation.mutateAsync(f.key),
      }}
    />
  );
}
