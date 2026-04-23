import type { SiteSettingResponse } from "@openrift/shared";
import { LoaderIcon, PlusIcon, SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { SectionHeading } from "@/components/admin/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFlushPrintingEvents } from "@/hooks/use-flush-printing-events";
import { usePostChangelog } from "@/hooks/use-post-changelog";
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

// ── Known settings ──────────────────────────────────────────────────────────
// Settings that application code reads. Other keys are stored but have no effect.

interface KnownSetting {
  key: string;
  scope: "web" | "api";
  description: string;
  placeholder: string;
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
    key: "discord-webhook-new-printings",
    scope: "api",
    description: "Discord webhook URL for #new-cards notifications",
    placeholder: "https://discord.com/api/webhooks/...",
  },
  {
    key: "discord-webhook-printing-changes",
    scope: "api",
    description: "Discord webhook URL for #data-updates notifications",
    placeholder: "https://discord.com/api/webhooks/...",
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

  const columns: AdminColumnDef<SiteSettingResponse, SettingDraft>[] = [
    {
      header: "Key",
      sortValue: (setting) => setting.key,
      cell: (setting) => {
        const known = KNOWN_SETTINGS.find((ks) => ks.key === setting.key);
        return (
          <div>
            <span className="font-mono text-sm">{setting.key}</span>
            {known && <p className="text-muted-foreground mt-0.5 text-xs">{known.description}</p>}
          </div>
        );
      },
      addCell: (draft, set) => (
        <Input
          value={draft.key}
          onChange={(event) => set((prev) => ({ ...prev, key: event.target.value.toLowerCase() }))}
          placeholder="my-custom-key"
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
    <div className="space-y-6">
      <AdminTable
        columns={columns}
        data={settings}
        getRowKey={(setting) => setting.key}
        emptyText="No site settings yet."
        toolbar={
          <p className="text-muted-foreground text-sm">
            Site settings are key-value pairs loaded at runtime. Web-scoped settings are available
            to the frontend; API-scoped settings are server-only.
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
              scope: draft.scope,
            }),
        }}
        delete={{
          onDelete: (setting) => deleteMutation.mutateAsync(setting.key),
        }}
      />

      {missingKnown.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-sm font-medium">Available settings</h3>
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
        <SectionHeading>Discord notifications</SectionHeading>
        <div className="space-y-2">
          <DiscordFlushPanel />
          <ChangelogPostPanel />
        </div>
      </div>

      <div>
        <SectionHeading>Analytics (this browser)</SectionHeading>
        <AnalyticsExclusionPanel />
      </div>
    </div>
  );
}

// ── Discord webhook flush ───────────────────────────────────────────────────

function DiscordFlushPanel() {
  const flush = useFlushPrintingEvents();

  async function handleFlush() {
    try {
      const result = await flush.mutateAsync();
      if (result.sent === 0 && result.failed === 0) {
        toast.success("No pending printing events");
      } else {
        toast.success(`Flushed ${result.sent} sent, ${result.failed} failed`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Flush failed");
    }
  }

  return (
    <div className="rounded-md border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Label>Flush pending printing events</Label>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Sends queued new-printing and printing-change events to the configured Discord webhooks
            now, instead of waiting for the next 15-minute cron tick.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleFlush} disabled={flush.isPending}>
          {flush.isPending ? (
            <LoaderIcon className="mr-1 size-4 animate-spin" />
          ) : (
            <SendIcon className="mr-1 size-4" />
          )}
          Flush now
        </Button>
      </div>
    </div>
  );
}

// ── Changelog post ──────────────────────────────────────────────────────────

function ChangelogPostPanel() {
  const post = usePostChangelog();

  async function handlePost() {
    try {
      const result = await post.mutateAsync();
      if (result.posted) {
        toast.success("Changelog posted to Discord");
      } else {
        toast.success("No entries to post (no webhook configured or no entries dated today)");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Post failed");
    }
  }

  return (
    <div className="rounded-md border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Label>Post today&apos;s changelog</Label>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Reads today&apos;s entries from the changelog and posts them to the
            <span className="font-mono"> discord-webhook-changelog</span> channel. Same action the
            daily cron runs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePost} disabled={post.isPending}>
          {post.isPending ? (
            <LoaderIcon className="mr-1 size-4 animate-spin" />
          ) : (
            <SendIcon className="mr-1 size-4" />
          )}
          Post now
        </Button>
      </div>
    </div>
  );
}

// ── Analytics exclusion (per-browser localStorage toggle) ───────────────────

const UMAMI_DISABLED_KEY = "umami.disabled";

function AnalyticsExclusionPanel() {
  const [excluded, setExcluded] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExcluded(localStorage.getItem(UMAMI_DISABLED_KEY) === "1");
    setHydrated(true);
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
    <div className="rounded-md border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Label htmlFor="umami-exclude" className="cursor-pointer">
            Exclude this browser from Umami analytics
          </Label>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Sets <span className="font-mono">localStorage[&quot;umami.disabled&quot;]</span> so
            Umami skips tracking on this device. Applies to this browser only, clear site data to
            reset.
          </p>
        </div>
        <Switch
          id="umami-exclude"
          checked={excluded}
          disabled={!hydrated}
          onCheckedChange={handleToggle}
        />
      </div>
    </div>
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
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={known.placeholder}
            className="h-8 w-72 font-mono"
          />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={pending}>
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
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
