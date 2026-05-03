import type { FeatureFlagResponse } from "@openrift/shared";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// ---------------------------------------------------------------------------
// Global flags section
// ---------------------------------------------------------------------------

interface FlagDraft {
  key: string;
  description: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;

// ── Known flags ──────────────────────────────────────────────────────────────
// Flags that application code checks. Other keys are stored but have no effect.

interface KnownFlag {
  key: string;
  description: string;
}

const KNOWN_FLAGS: KnownFlag[] = [
  {
    key: "copies-tracked",
    description: "Show the total copies tracked counter on the landing page",
  },
  {
    key: "rules",
    description: "Show the game rules page and header link",
  },
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
];

function GlobalFlagsSection() {
  const { data } = useFeatureFlags();
  const toggleMutation = useToggleFeatureFlag();
  const createMutation = useCreateFeatureFlag();
  const deleteMutation = useDeleteFeatureFlag();
  const { flags } = data;

  const existingKeys = new Set(flags.map((flag) => flag.key));
  const missingKnown = KNOWN_FLAGS.filter((kf) => !existingKeys.has(kf.key));

  const columns: AdminColumnDef<FeatureFlagResponse, FlagDraft>[] = [
    {
      header: "Key",
      sortValue: (f) => f.key,
      cell: (f) => {
        const known = KNOWN_FLAGS.find((kf) => kf.key === f.key);
        return (
          <div>
            <span className="font-mono text-sm">{f.key}</span>
            {known && <p className="text-muted-foreground mt-0.5 text-xs">{known.description}</p>}
          </div>
        );
      },
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
    <div className="space-y-6">
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
          label: "Add Custom Flag",
        }}
        delete={{
          onDelete: (f) => deleteMutation.mutateAsync(f.key),
        }}
      />

      {missingKnown.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-sm font-medium">Available flags</h3>
          <div className="divide-border divide-y rounded-md border">
            {missingKnown.map((known) => (
              <KnownFlagRow
                key={known.key}
                known={known}
                onCreate={(description) =>
                  createMutation.mutateAsync({
                    key: known.key,
                    description,
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

function OverridesSection() {
  const { data } = useFeatureFlagOverrides();
  const { data: flagsData } = useFeatureFlags();
  const { data: usersData } = useAdminUsers();
  const upsertMutation = useUpsertFeatureFlagOverride();
  const deleteMutation = useDeleteFeatureFlagOverride();

  const flagKeys = flagsData.flags.map((f) => f.key).toSorted();
  const users = usersData.users.toSorted((a, b) => a.email.localeCompare(b.email));

  const columns: AdminColumnDef<OverrideRow, OverrideDraft>[] = [
    {
      header: "User",
      sortValue: (r) => r.userEmail,
      cell: (r) => (
        <span className="text-sm">
          {r.userEmail}
          {r.userName ? <span className="text-muted-foreground ml-1">({r.userName})</span> : null}
        </span>
      ),
      addCell: (d, set) => (
        <select
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          value={d.userId}
          onChange={(e) => set((prev) => ({ ...prev, userId: e.target.value }))}
        >
          <option value="">Select user...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
              {u.name ? ` (${u.name})` : ""}
            </option>
          ))}
        </select>
      ),
    },
    {
      header: "Flag",
      sortValue: (r) => r.flagKey,
      cell: (r) => <span className="font-mono text-sm">{r.flagKey}</span>,
      addCell: (d, set) => (
        <select
          className="border-input bg-background h-8 rounded-md border px-2 font-mono text-sm"
          value={d.flagKey}
          onChange={(e) => set((prev) => ({ ...prev, flagKey: e.target.value }))}
        >
          <option value="">Select flag...</option>
          {flagKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      ),
    },
    {
      header: "Override",
      align: "center",
      width: "w-24",
      cell: (r) => (
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={r.enabled}
            onCheckedChange={(checked: boolean) =>
              upsertMutation.mutate({ userId: r.userId, flagKey: r.flagKey, enabled: checked })
            }
            disabled={upsertMutation.isPending}
          />
          <Badge variant={r.enabled ? "default" : "secondary"}>{r.enabled ? "On" : "Off"}</Badge>
        </div>
      ),
      addCell: (d, set) => (
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={d.enabled}
            onCheckedChange={(checked: boolean) => set((prev) => ({ ...prev, enabled: checked }))}
          />
          <Badge variant={d.enabled ? "default" : "secondary"}>{d.enabled ? "On" : "Off"}</Badge>
        </div>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={data.overrides}
      getRowKey={(r) => `${r.userId}-${r.flagKey}`}
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
      <div>
        <h2 className="mb-2 text-lg font-semibold">Global Flags</h2>
        <GlobalFlagsSection />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">Per-User Overrides</h2>
        <OverridesSection />
      </div>
    </div>
  );
}
