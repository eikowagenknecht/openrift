import type { SiteSettingResponse } from "@openrift/shared";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Eyebrow } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  useCreateSiteSetting,
  useDeleteSiteSetting,
  useSiteSettings,
  useUpdateSiteSetting,
} from "@/hooks/use-site-settings";
import { isValidKebabKey } from "@/lib/admin-slug";

interface SettingDraft {
  key: string;
  value: string;
  scope: string;
}

// ── Known settings ──────────────────────────────────────────────────────────
// Settings that application code reads. Other keys are stored but have no effect.

interface KnownSetting {
  key: string;
  scope: "web" | "api";
  description: string;
  /** Free-text settings only — a boolean is edited with a Switch. */
  placeholder?: string;
  /**
   * Booleans are stored as the strings `"true"` / `"false"` and rendered as a
   * Switch instead of a text field. The server reads anything that isn't
   * `"false"` as on, so a key that was never created stays on.
   */
  type?: "boolean";
}

const KNOWN_SETTINGS: KnownSetting[] = [
  {
    key: "umami-url",
    scope: "web",
    description: "Base URL of the Umami analytics instance",
    placeholder: "https://analytics.example.com",
  },
  {
    key: "umami-website-id",
    scope: "web",
    description: "Umami website ID (both umami keys must be set for analytics to load)",
    placeholder: "a1b2c3d4-...",
  },
  {
    key: "trade-request-email",
    scope: "api",
    type: "boolean",
    description: "Instant trade-request emails (ADR-030). Turn off to stop sending",
  },
  {
    key: "trade-match-digest",
    scope: "api",
    type: "boolean",
    description: "Daily trade match digest (ADR-030). Turn off to stop sending",
  },
  {
    key: "trade-status-email",
    scope: "api",
    type: "boolean",
    description:
      "Trade status emails: accepted / declined / cancelled (ADR-030). Turn off to stop sending",
  },
];

/** @returns The known-setting entry for `key`, or `undefined` for a custom key. */
function knownSetting(key: string): KnownSetting | undefined {
  return KNOWN_SETTINGS.find((ks) => ks.key === key);
}

/** @returns Whether the stored string counts as on (anything but `"false"`). */
function isSettingOn(value: string): boolean {
  return value !== "false";
}

function KeyCell({ row }: AdminCellSlotProps<SiteSettingResponse>) {
  if (!row) {
    return null;
  }
  const known = knownSetting(row.key);
  return (
    <div>
      <span className="font-mono text-sm">{row.key}</span>
      {known && <p className="text-muted-foreground mt-0.5 text-xs">{known.description}</p>}
    </div>
  );
}

function ValueCell({ row }: AdminCellSlotProps<SiteSettingResponse>) {
  const updateMutation = useUpdateSiteSetting();
  if (!row) {
    return null;
  }
  // Booleans toggle in place — going through the row's edit mode to type the
  // word "false" would be a poor switch for something that stops live sends.
  if (knownSetting(row.key)?.type === "boolean") {
    const on = isSettingOn(row.value);
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={on}
          onCheckedChange={(checked: boolean) =>
            updateMutation.mutate({ key: row.key, value: checked ? "true" : "false" })
          }
          disabled={updateMutation.isPending}
        />
        <Badge variant={on ? "default" : "secondary"}>{on ? "On" : "Off"}</Badge>
      </div>
    );
  }
  return <span className="max-w-xs truncate font-mono text-sm">{row.value}</span>;
}

function ScopeCell({ row }: AdminCellSlotProps<SiteSettingResponse>) {
  if (!row) {
    return null;
  }
  return <Badge variant={row.scope === "web" ? "default" : "secondary"}>{row.scope}</Badge>;
}

function KeyAddInput({ draft, setDraft }: AdminDraftSlotProps<SettingDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.key}
      onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value.toLowerCase() }))}
      placeholder="my-custom-key"
      className="h-8 w-48 font-mono"
    />
  );
}

function ValueInput({ draft, setDraft }: AdminDraftSlotProps<SettingDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  // A boolean row edits as a Switch here too, so the scope-editing path can't
  // save a typo like "off" into a value the server only compares to "false".
  if (knownSetting(draft.key)?.type === "boolean") {
    return (
      <Switch
        checked={isSettingOn(draft.value)}
        onCheckedChange={(checked: boolean) =>
          setDraft((prev) => ({ ...prev, value: checked ? "true" : "false" }))
        }
      />
    );
  }
  return (
    <Input
      value={draft.value}
      onChange={(event) => setDraft((prev) => ({ ...prev, value: event.target.value }))}
      className="h-8 font-mono"
    />
  );
}

function ValueAddInput({ draft, setDraft }: AdminDraftSlotProps<SettingDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.value}
      onChange={(event) => setDraft((prev) => ({ ...prev, value: event.target.value }))}
      placeholder="https://..."
      className="h-8 font-mono"
    />
  );
}

function ScopeSelect({ draft, setDraft }: AdminDraftSlotProps<SettingDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Select
      value={draft.scope}
      onValueChange={(scope) => {
        if (scope) {
          setDraft((prev) => ({ ...prev, scope }));
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
  );
}

const columns: AdminColumnDef<SiteSettingResponse, SettingDraft>[] = [
  {
    header: "Key",
    sortValue: (setting) => setting.key,
    cell: <KeyCell />,
    addCell: <KeyAddInput />,
  },
  {
    header: "Value",
    cell: <ValueCell />,
    editCell: <ValueInput />,
    addCell: <ValueAddInput />,
  },
  {
    header: "Scope",
    align: "center",
    width: "w-28",
    cell: <ScopeCell />,
    editCell: <ScopeSelect />,
    addCell: <ScopeSelect />,
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export function SiteSettingsPage() {
  const { data } = useSiteSettings();
  const updateMutation = useUpdateSiteSetting();
  const createMutation = useCreateSiteSetting();
  const deleteMutation = useDeleteSiteSetting();
  const { settings } = data;

  const existingKeys = new Set(settings.map((s) => s.key));
  const missingKnown = KNOWN_SETTINGS.filter((ks) => !existingKeys.has(ks.key));

  return (
    <div className="space-y-6">
      <AdminTable
        columns={columns}
        data={settings}
        getRowKey={(setting) => setting.key}
        emptyText="No site settings yet."
        title="Site Settings"
        add={{
          emptyDraft: { key: "", value: "", scope: "web" },
          onSave: (draft) =>
            createMutation.mutateAsync({
              key: draft.key.trim(),
              value: draft.value,
              // The draft scope is a loose string (Select + string-typed list
              // response); the Select constrains it to these two at runtime.
              scope: draft.scope as "web" | "api",
            }),
          validate: (draft) => {
            const key = draft.key.trim();
            if (!key) {
              return "Key is required";
            }
            if (!isValidKebabKey(key)) {
              return "Key must be kebab-case (e.g. umami-url)";
            }
            if (!draft.value) {
              return "Value is required";
            }
            return null;
          },
          label: "Add Custom Setting",
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
              scope: draft.scope as "web" | "api",
            }),
        }}
        delete={{
          onDelete: (setting) => deleteMutation.mutateAsync(setting.key),
        }}
      />

      {missingKnown.length > 0 && (
        <div className="space-y-2">
          <Eyebrow className="mb-0">Available settings</Eyebrow>
          <div className="divide-border divide-y rounded-md border">
            {missingKnown.map((known) => (
              <KnownSettingRow
                key={known.key}
                known={known}
                onCreate={(value) =>
                  createMutation.mutateAsync({
                    key: known.key,
                    value,
                    scope: known.scope,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <Eyebrow>Analytics (this browser)</Eyebrow>
        <AnalyticsExclusionPanel />
      </div>
    </div>
  );
}

// ── Analytics exclusion (per-browser localStorage toggle) ───────────────────

const UMAMI_DISABLED_KEY = "umami.disabled";

function AnalyticsExclusionPanel() {
  const hydrated = useHydrated();
  const [excluded, setExcluded] = useState(false);

  useEffect(() => {
    setExcluded(localStorage.getItem(UMAMI_DISABLED_KEY) === "1");
  }, []);

  function handleToggle(next: boolean) {
    if (next) {
      localStorage.setItem(UMAMI_DISABLED_KEY, "1");
    } else {
      localStorage.removeItem(UMAMI_DISABLED_KEY);
    }
    setExcluded(next);
  }

  return (
    <Field orientation="horizontal" className="rounded-md border px-4 py-3">
      <FieldContent>
        <FieldLabel htmlFor="umami-exclude" className="cursor-pointer">
          Exclude this browser from Umami analytics
        </FieldLabel>
        <FieldDescription>
          Disables Umami tracking in this browser. Clear site data to reset.
        </FieldDescription>
      </FieldContent>
      <Switch
        id="umami-exclude"
        checked={excluded}
        disabled={!hydrated}
        onCheckedChange={handleToggle}
      />
    </Field>
  );
}

// ── Known setting placeholder row ───────────────────────────────────────────

function KnownSettingRow({
  known,
  onCreate,
}: {
  known: KnownSetting;
  onCreate: (value: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isBoolean = known.type === "boolean";

  async function handleSave() {
    if (!value.trim()) {
      setSaveError("Value is required");
      return;
    }
    setPending(true);
    setSaveError("");
    try {
      await onCreate(value.trim());
      setEditing(false);
      setValue("");
      setPending(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
      setPending(false);
    }
  }

  // A boolean needs nothing typed: creating it restores the default-on row, and
  // the table's Switch takes over from there.
  async function handleCreateOn() {
    setPending(true);
    setSaveError("");
    try {
      await onCreate("true");
      setPending(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-sm">{known.key}</span>
          <Badge variant={known.scope === "web" ? "default" : "secondary"} className="text-xs">
            {known.scope}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">{known.description}</p>
      </div>
      {isBoolean ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCreateOn} disabled={pending}>
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            Set up
          </Button>
          {saveError && <span className="text-destructive text-xs">{saveError}</span>}
        </div>
      ) : editing ? (
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={known.placeholder}
            className="w-72 font-mono"
          />
          <Button variant="outline" onClick={handleSave} disabled={pending}>
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setValue("");
              setSaveError("");
            }}
          >
            Cancel
          </Button>
          {saveError && <span className="text-destructive text-xs">{saveError}</span>}
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <PlusIcon className="mr-1 h-3.5 w-3.5" />
          Set up
        </Button>
      )}
    </div>
  );
}
