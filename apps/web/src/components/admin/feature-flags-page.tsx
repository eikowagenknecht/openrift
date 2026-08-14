import type { FeatureFlagResponse } from "@openrift/shared";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Eyebrow, Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAdminUsers } from "@/hooks/use-admin-users";
import {
  useCreateFeatureFlag,
  useDeleteFeatureFlag,
  useDeleteFeatureFlagOverride,
  useFeatureFlagOverrides,
  useFeatureFlags,
  useToggleFeatureFlag,
  useUpsertFeatureFlagOverride,
} from "@/hooks/use-feature-flags";
import { isValidKebabKey } from "@/lib/admin-slug";

// ---------------------------------------------------------------------------
// Global flags section
// ---------------------------------------------------------------------------

interface FlagDraft {
  key: string;
  description: string;
}

// ── Known flags ──────────────────────────────────────────────────────────────
// Flags that application code checks. Other keys are stored but have no effect.

interface KnownFlag {
  key: string;
  description: string;
  /**
   * Value to seed when an admin creates this flag from the list. Defaults to
   * `false` (the convention for "enable to turn on" flags). Set `true` for a
   * default-on kill switch so creating it doesn't change behaviour — turn it
   * off to disable the feature.
   */
  enabled?: boolean;
}

const KNOWN_FLAGS: KnownFlag[] = [
  {
    key: "glossary",
    description: "Show the glossary page (symbols, keywords) and header link",
  },
  {
    key: "price-history",
    description: "Show the Value Over Time chart on the collection stats page",
  },
  {
    key: "help-how-to-play",
    description: "Show the How to Play Riftbound help article",
  },
  {
    key: "developers",
    description: "Show the public API docs page (/developers), its footer link, and sitemap entry",
  },
  {
    key: "trade-request-email",
    description: "Instant trade-request emails (ADR-030). On by default — turn OFF to stop sending",
    enabled: true,
  },
  {
    key: "trade-match-digest",
    description: "Daily trade match digest (ADR-030). On by default — turn OFF to stop sending",
    enabled: true,
  },
  {
    key: "trade-status-email",
    description:
      "Trade status emails: accepted / declined / cancelled (ADR-030). On by default — turn OFF to stop sending",
    enabled: true,
  },
  {
    key: "overlay",
    description:
      "Creator tools: the /overlay stream control dashboard and OBS source, plus the Present entry points. The routes themselves stay reachable by URL",
  },
];

function FlagKeyCell({ row }: AdminCellSlotProps<FeatureFlagResponse>) {
  if (!row) {
    return null;
  }
  const known = KNOWN_FLAGS.find((kf) => kf.key === row.key);
  return (
    <div>
      <span className="font-mono text-sm">{row.key}</span>
      {known && <p className="text-muted-foreground mt-0.5 text-xs">{known.description}</p>}
    </div>
  );
}

function FlagDescriptionCell({ row }: AdminCellSlotProps<FeatureFlagResponse>) {
  if (!row) {
    return null;
  }
  return (
    row.description || <span className="text-muted-foreground text-sm italic">No description</span>
  );
}

function FlagStatusCell({ row }: AdminCellSlotProps<FeatureFlagResponse>) {
  const toggleMutation = useToggleFeatureFlag();
  if (!row) {
    return null;
  }
  return (
    <div className="flex items-center justify-center gap-2">
      <Switch
        checked={row.enabled}
        onCheckedChange={(checked: boolean) =>
          toggleMutation.mutate({ key: row.key, enabled: checked })
        }
        disabled={toggleMutation.isPending}
      />
      <Badge variant={row.enabled ? "default" : "secondary"}>{row.enabled ? "On" : "Off"}</Badge>
    </div>
  );
}

function FlagKeyAddInput({ draft, setDraft }: AdminDraftSlotProps<FlagDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.key}
      onChange={(e) => setDraft((prev) => ({ ...prev, key: e.target.value.toLowerCase() }))}
      placeholder="deck-builder"
      className="h-8 w-48 font-mono"
    />
  );
}

function FlagDescriptionAddInput({ draft, setDraft }: AdminDraftSlotProps<FlagDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder="What this flag controls"
      className="h-8"
    />
  );
}

const globalFlagColumns: AdminColumnDef<FeatureFlagResponse, FlagDraft>[] = [
  {
    header: "Key",
    sortValue: (f) => f.key,
    cell: <FlagKeyCell />,
    addCell: <FlagKeyAddInput />,
  },
  {
    header: "Description",
    cell: <FlagDescriptionCell />,
    addCell: <FlagDescriptionAddInput />,
  },
  {
    header: "Status",
    align: "center",
    width: "w-24",
    cell: <FlagStatusCell />,
  },
];

function GlobalFlagsSection() {
  const { data } = useFeatureFlags();
  const createMutation = useCreateFeatureFlag();
  const deleteMutation = useDeleteFeatureFlag();
  const { flags } = data;

  const existingKeys = new Set(flags.map((flag) => flag.key));
  const missingKnown = KNOWN_FLAGS.filter((kf) => !existingKeys.has(kf.key));

  return (
    <div className="space-y-6">
      <AdminTable
        columns={globalFlagColumns}
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
            if (!isValidKebabKey(key)) {
              return "Key must be kebab-case (e.g. deck-builder)";
            }
            return null;
          },
          label: "Add Custom Flag",
        }}
        delete={{
          onDelete: (f) => deleteMutation.mutateAsync(f.key),
        }}
      />

      {missingKnown.length > 0 && (
        <div className="space-y-2">
          <Eyebrow className="mb-0">Available flags</Eyebrow>
          <div className="divide-border divide-y rounded-md border">
            {missingKnown.map((known) => (
              <KnownFlagRow
                key={known.key}
                known={known}
                onCreate={(description) =>
                  createMutation.mutateAsync({
                    key: known.key,
                    description,
                    enabled: known.enabled ?? false,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Known flag placeholder row ──────────────────────────────────────────────

function KnownFlagRow({
  known,
  onCreate,
}: {
  known: KnownFlag;
  onCreate: (description: string) => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function handleCreate() {
    setPending(true);
    setSaveError("");
    try {
      await onCreate(known.description);
      setPending(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Creation failed");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground font-mono text-sm">{known.key}</span>
        <p className="text-muted-foreground mt-0.5 text-xs">{known.description}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={handleCreate} disabled={pending}>
        <PlusIcon className="mr-1 h-3.5 w-3.5" />
        Set up
      </Button>
      {saveError && <span className="text-destructive text-xs">{saveError}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-user overrides section
// ---------------------------------------------------------------------------

interface OverrideRow {
  userId: string;
  userName: string | null;
  userEmail: string;
  flagKey: string;
  enabled: boolean;
}

interface OverrideDraft {
  userId: string;
  flagKey: string;
  enabled: boolean;
}

function OverrideUserCell({ row }: AdminCellSlotProps<OverrideRow>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-sm">
      {row.userName ?? row.userEmail}
      {row.userName ? <span className="text-muted-foreground ml-1">({row.userEmail})</span> : null}
    </span>
  );
}

function OverrideFlagCell({ row }: AdminCellSlotProps<OverrideRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.flagKey}</span>;
}

function OverrideStatusCell({ row }: AdminCellSlotProps<OverrideRow>) {
  const upsertMutation = useUpsertFeatureFlagOverride();
  if (!row) {
    return null;
  }
  return (
    <div className="flex items-center justify-center gap-2">
      <Switch
        checked={row.enabled}
        onCheckedChange={(checked: boolean) =>
          upsertMutation.mutate({ userId: row.userId, flagKey: row.flagKey, enabled: checked })
        }
        disabled={upsertMutation.isPending}
      />
      <Badge variant={row.enabled ? "default" : "secondary"}>{row.enabled ? "On" : "Off"}</Badge>
    </div>
  );
}

function OverrideUserAddSelect({ draft, setDraft }: AdminDraftSlotProps<OverrideDraft>) {
  const { data: usersData } = useAdminUsers();
  const users = usersData.users.toSorted((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
  const userItems = users.map((u) => ({
    value: u.id,
    label: u.name ? `${u.name} (${u.email})` : u.email,
  }));
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Select
      items={userItems}
      value={draft.userId}
      onValueChange={(userId) => {
        if (userId !== null) {
          setDraft((prev) => ({ ...prev, userId }));
        }
      }}
    >
      <SelectTrigger className="h-8" aria-label="User">
        <SelectValue placeholder="Select user..." />
      </SelectTrigger>
      <SelectContent>
        {userItems.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OverrideFlagAddSelect({ draft, setDraft }: AdminDraftSlotProps<OverrideDraft>) {
  const { data: flagsData } = useFeatureFlags();
  const flagKeys = flagsData.flags.map((f) => f.key).toSorted();
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Select
      value={draft.flagKey}
      onValueChange={(flagKey) => {
        if (flagKey !== null) {
          setDraft((prev) => ({ ...prev, flagKey }));
        }
      }}
    >
      <SelectTrigger className="h-8 font-mono" aria-label="Flag">
        <SelectValue placeholder="Select flag..." />
      </SelectTrigger>
      <SelectContent>
        {flagKeys.map((key) => (
          <SelectItem key={key} value={key} className="font-mono">
            {key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OverrideStatusAddCell({ draft, setDraft }: AdminDraftSlotProps<OverrideDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <div className="flex items-center justify-center gap-2">
      <Switch
        checked={draft.enabled}
        onCheckedChange={(checked: boolean) => setDraft((prev) => ({ ...prev, enabled: checked }))}
      />
      <Badge variant={draft.enabled ? "default" : "secondary"}>
        {draft.enabled ? "On" : "Off"}
      </Badge>
    </div>
  );
}

const overrideColumns: AdminColumnDef<OverrideRow, OverrideDraft>[] = [
  {
    header: "User",
    sortValue: (r) => r.userName ?? r.userEmail,
    cell: <OverrideUserCell />,
    addCell: <OverrideUserAddSelect />,
  },
  {
    header: "Flag",
    sortValue: (r) => r.flagKey,
    cell: <OverrideFlagCell />,
    addCell: <OverrideFlagAddSelect />,
  },
  {
    header: "Override",
    align: "center",
    width: "w-24",
    cell: <OverrideStatusCell />,
    addCell: <OverrideStatusAddCell />,
  },
];

function OverridesSection() {
  const { data } = useFeatureFlagOverrides();
  const upsertMutation = useUpsertFeatureFlagOverride();
  const deleteMutation = useDeleteFeatureFlagOverride();

  return (
    <AdminTable
      columns={overrideColumns}
      data={data.overrides}
      getRowKey={(r) => `${r.userId}-${r.flagKey}`}
      defaultSort={{ column: "User", direction: "asc" }}
      emptyText="No per-user overrides."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Per-user overrides take precedence over global defaults.
        </p>
      }
      add={{
        emptyDraft: { userId: "", flagKey: "", enabled: true },
        onSave: (d) =>
          upsertMutation.mutateAsync({
            userId: d.userId,
            flagKey: d.flagKey,
            enabled: d.enabled,
          }),
        validate: (d) => {
          if (!d.userId) {
            return "User is required";
          }
          if (!d.flagKey) {
            return "Flag is required";
          }
          return null;
        },
        label: "Add Override",
      }}
      delete={{
        onDelete: (r) => deleteMutation.mutateAsync({ userId: r.userId, flagKey: r.flagKey }),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FeatureFlagsPage() {
  return (
    <div className="space-y-8">
      <AdminPageTopBar title="Feature Flags" />
      <div className="space-y-2">
        <Heading level={2}>Global Flags</Heading>
        <GlobalFlagsSection />
      </div>
      <div className="space-y-2">
        <Heading level={2}>Per-User Overrides</Heading>
        <OverridesSection />
      </div>
    </div>
  );
}
