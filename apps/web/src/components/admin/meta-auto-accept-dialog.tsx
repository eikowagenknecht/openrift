import { formatDayTime } from "@openrift/shared";
import type { MetaSource, MetaSyncSettings } from "@openrift/shared/contracts/admin/meta-catalog";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMetaSyncSettings, useUpdateMetaSyncSettings } from "@/hooks/use-admin-meta-catalog";
import { META_SOURCE_LABELS } from "@/lib/meta-catalog-display";

/** The auto-accept rule form's editable shape. */
interface RulesDraft {
  minPlayersEnabled: boolean;
  minPlayers: string;
  notable: boolean;
  official: boolean;
}

function toDraft(settings: MetaSyncSettings): RulesDraft {
  return {
    minPlayersEnabled: settings.autoAcceptMinPlayers !== null,
    minPlayers:
      settings.autoAcceptMinPlayers === null ? "64" : String(settings.autoAcceptMinPlayers),
    notable: settings.autoAcceptNotable,
    official: settings.autoAcceptOfficial,
  };
}

/**
 * What each source's crawl actually consults. Only uvsgames has templates and a
 * format mapping, so the other two rules would be dead switches on the second
 * source's tab rather than settings it ignores quietly.
 */
const SOURCE_INTRO: Record<MetaSource, string> = {
  uvsgames:
    "When a crawl sees an event matching any rule below, it is accepted automatically: the live event is created and its UVS Games standings are fetched and published without review. Events you dismissed never auto-accept, whatever they match.",
  playloltcg:
    "When a crawl sees an event matching the rule below, it is accepted automatically: the live event is created and its Play LoL TCG standings are fetched and published without review. Events you dismissed never auto-accept. This source publishes no event templates, so field size is the only rule it can be judged on.",
};

/** The other source the one shared rule also governs. */
const OTHER_SOURCE: Record<MetaSource, MetaSource> = {
  uvsgames: "playloltcg",
  playloltcg: "uvsgames",
};

function AutoAcceptForm({
  source,
  settings,
  onClose,
}: {
  source: MetaSource;
  settings: MetaSyncSettings;
  onClose: () => void;
}) {
  const update = useUpdateMetaSyncSettings();
  const [draft, setDraft] = useState(() => toDraft(settings));
  // A save answers with the stored row, and the stamp is what says it landed.
  // Copying it back in keeps the form showing what the server actually holds.
  const [seenAt, setSeenAt] = useState(settings.updatedAt);
  if (settings.updatedAt !== seenAt) {
    setSeenAt(settings.updatedAt);
    setDraft(toDraft(settings));
  }

  const playerCountValid = /^\d+$/u.test(draft.minPlayers) && Number(draft.minPlayers) > 0;
  const canSave = (!draft.minPlayersEnabled || playerCountValid) && !update.isPending;

  function save() {
    update.mutate({
      autoAcceptMinPlayers: draft.minPlayersEnabled ? Number(draft.minPlayers) : null,
      autoAcceptNotable: draft.notable,
      autoAcceptOfficial: draft.official,
    });
  }

  return (
    <DialogForm onSubmit={save}>
      <DialogHeader>
        <DialogTitle>Auto-accept rules</DialogTitle>
        <DialogDescription>{SOURCE_INTRO[source]}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            id="meta-auto-accept-players"
            checked={draft.minPlayersEnabled}
            onCheckedChange={(checked: boolean) =>
              setDraft((prev) => ({ ...prev, minPlayersEnabled: checked }))
            }
          />
          <Label htmlFor="meta-auto-accept-players">Field size of at least</Label>
          <Input
            type="number"
            min={1}
            value={draft.minPlayers}
            disabled={!draft.minPlayersEnabled}
            onChange={(event) => setDraft((prev) => ({ ...prev, minPlayers: event.target.value }))}
            aria-label="Minimum field size"
            className="w-24"
          />
          <span className="text-muted-foreground">players</span>
        </div>
        {draft.minPlayersEnabled && !playerCountValid && (
          <p className="text-destructive">Enter a whole number of players above zero.</p>
        )}
        <p className="text-muted-foreground">
          Both catalogues read this threshold, so a change here also governs{" "}
          {META_SOURCE_LABELS[OTHER_SOURCE[source]]}.
        </p>
        {source === "uvsgames" && (
          <>
            <div className="flex items-center gap-3">
              <Switch
                id="meta-auto-accept-official"
                checked={draft.official}
                onCheckedChange={(checked: boolean) =>
                  setDraft((prev) => ({ ...prev, official: checked }))
                }
              />
              <Label htmlFor="meta-auto-accept-official">
                Runs on a template you watch (set those under Templates &amp; formats)
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="meta-auto-accept-notable"
                checked={draft.notable}
                onCheckedChange={(checked: boolean) =>
                  setDraft((prev) => ({ ...prev, notable: checked }))
                }
              />
              <Label htmlFor="meta-auto-accept-notable">
                Name matches the notable vocabulary (regional, qualifier, championship,
                invitational)
              </Label>
            </div>
          </>
        )}
        <p className="text-muted-foreground">Last changed {formatDayTime(settings.updatedAt)}.</p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          Save rules
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}

/**
 * The rules that let a crawled event into the archive without a click
 * (ADR-014). They belong beside the triage queue they short-circuit, so the
 * catalogue tab hosts them and mounts this only while it is open.
 *
 * @returns The auto-accept rules dialog.
 */
export function MetaAutoAcceptDialog({
  source,
  onClose,
}: {
  source: MetaSource;
  onClose: () => void;
}) {
  const { data } = useMetaSyncSettings();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {data === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>Auto-accept rules</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">Loading the rules…</p>
          </>
        ) : (
          <AutoAcceptForm source={source} settings={data} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
