import type { SiteSettingResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateSiteSetting,
  useDeleteSiteSetting,
  useSiteSettings,
  useUpdateSiteSetting,
} from "@/hooks/use-site-settings";

interface SettingDraft {
  key: string;
  value: string;
  scope: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;

export function SiteSettingsPage() {
  const { data } = useSiteSettings();
  const updateMutation = useUpdateSiteSetting();
  const createMutation = useCreateSiteSetting();
  const deleteMutation = useDeleteSiteSetting();
  const { settings } = data;

  const columns: AdminColumnDef<SiteSettingResponse, SettingDraft>[] = [
    {
      header: "Key",
      sortValue: (setting) => setting.key,
      cell: (setting) => <span className="font-mono text-sm">{setting.key}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.key}
          onChange={(event) => set((prev) => ({ ...prev, key: event.target.value.toLowerCase() }))}
          placeholder="umami-url"
          className="h-8 w-48 font-mono"
        />
      ),
    },
    {
      header: "Value",
      cell: (setting) => (
        <span className="max-w-xs truncate font-mono text-sm">{setting.value}</span>
      ),
      editCell: (draft, set) => (
        <Input
          value={draft.value}
          onChange={(event) => set((prev) => ({ ...prev, value: event.target.value }))}
          className="h-8 font-mono"
        />
      ),
      addCell: (draft, set) => (
        <Input
          value={draft.value}
          onChange={(event) => set((prev) => ({ ...prev, value: event.target.value }))}
          placeholder="https://..."
          className="h-8 font-mono"
        />
      ),
    },
    {
      header: "Scope",
      align: "center",
      width: "w-28",
      cell: (setting) => (
        <Badge variant={setting.scope === "web" ? "default" : "secondary"}>{setting.scope}</Badge>
      ),
      editCell: (draft, set) => (
        <Select
          value={draft.scope}
          onValueChange={(scope) => {
            if (scope) {
              set((prev) => ({ ...prev, scope }));
            }
          }}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="web">web</SelectItem>
            <SelectItem value="api">api</SelectItem>
          </SelectContent>
        </Select>
      ),
      addCell: (draft, set) => (
        <Select
          value={draft.scope}
          onValueChange={(scope) => {
            if (scope) {
              set((prev) => ({ ...prev, scope }));
            }
          }}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="web">web</SelectItem>
            <SelectItem value="api">api</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={settings}
      getRowKey={(setting) => setting.key}
      emptyText="No site settings yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Site settings are key-value pairs loaded at runtime. Web-scoped settings are available to
          the frontend; API-scoped settings are server-only.
        </p>
      }
      add={{
        emptyDraft: { key: "", value: "", scope: "web" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            key: draft.key.trim(),
            value: draft.value,
            scope: draft.scope,
          }),
        validate: (draft) => {
          const key = draft.key.trim();
          if (!key) {
            return "Key is required";
          }
          if (!KEBAB_RE.test(key)) {
            return "Key must be kebab-case (e.g. umami-url)";
          }
          if (!draft.value) {
            return "Value is required";
          }
          return null;
        },
        label: "Add Setting",
      }}
      edit={{
        toDraft: (setting) => ({
          key: setting.key,
          value: setting.value,
          scope: setting.scope,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            key: draft.key,
            value: draft.value,
            scope: draft.scope,
          }),
      }}
      delete={{
        onDelete: (setting) => deleteMutation.mutateAsync(setting.key),
      }}
    />
  );
}
