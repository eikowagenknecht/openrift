import type { MetaEventDrift } from "@openrift/shared/types/api/meta";
import type { MetaEventOverlayField } from "@openrift/shared/types/enums";
import { META_EVENT_OVERLAY_FIELDS, META_EVENT_TIERS } from "@openrift/shared/types/enums";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LockOpenIcon,
  LockIcon,
  PencilIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMetaEventDrift,
  useReleaseMetaEventOverlayField,
  useSetMetaSourcePriority,
  useWriteMetaEventOverlayFields,
} from "@/features/admin/hooks/use-admin-meta-overlays";
import { META_EVENT_TIER_LABELS } from "@/features/meta/lib/meta-format";
import { sourceProviderDisplay } from "@/features/meta/lib/meta-source-review";
import { cn } from "@/lib/utils";

type DriftField = MetaEventDrift["fields"][number];

const MIN_PRIORITY = 0;
const MAX_PRIORITY = 999;

export function isOverlayField(field: string): field is MetaEventOverlayField {
  return (META_EVENT_OVERLAY_FIELDS as readonly string[]).includes(field);
}

export function isContested(field: DriftField): boolean {
  return (
    !field.claimedByOverlay &&
    field.bySource.some((cell) => cell.value !== null && cell.value !== field.live)
  );
}

function SourceHeader({ source }: { source: MetaEventDrift["sources"][number] }) {
  const provider = sourceProviderDisplay(source.provider ?? "manual");
  const setPriority = useSetMetaSourcePriority();

  async function move(delta: number): Promise<void> {
    const priority = Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, source.priority + delta));
    try {
      await setPriority.mutateAsync({ id: source.id, priority });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Reordered. The event has been promoted again.");
  }

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={provider.variant}>{provider.label}</Badge>
      {!source.hasMirror && <span className="text-muted-foreground">no crawler</span>}
      <span className="text-muted-foreground tabular-nums">#{source.priority}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Raise ${provider.label}'s priority`}
        disabled={setPriority.isPending || source.priority >= MAX_PRIORITY}
        onClick={() => {
          void move(1);
        }}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Lower ${provider.label}'s priority`}
        disabled={setPriority.isPending || source.priority <= MIN_PRIORITY}
        onClick={() => {
          void move(-1);
        }}
      >
        <ChevronDownIcon />
      </Button>
    </div>
  );
}

function ClaimForm({
  metaEventId,
  field,
  live,
  onDone,
}: {
  metaEventId: string;
  field: MetaEventOverlayField;
  live: string | null;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(live ?? "");
  const write = useWriteMetaEventOverlayFields();

  async function save(): Promise<void> {
    try {
      await write.mutateAsync({ id: metaEventId, edits: [{ field, value: draft }] });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Claimed. The archive owns this field now.");
    onDone();
  }

  return (
    <span className="flex items-center gap-1">
      {field === "tier" && (
        <Select
          value={draft}
          onValueChange={(value) => {
            if (value !== null) {
              setDraft(value as string);
            }
          }}
          items={META_EVENT_TIER_LABELS}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {META_EVENT_TIERS.map((tier) => (
              <SelectItem key={tier} value={tier}>
                {META_EVENT_TIER_LABELS[tier]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field === "eventDate" && (
        <DatePicker
          value={draft}
          onChange={setDraft}
          onClear={() => {
            setDraft("");
          }}
        />
      )}
      {field !== "tier" && field !== "eventDate" && (
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          inputMode={field === "playerCount" ? "numeric" : undefined}
          className="h-7 w-44"
          aria-label={`New value for ${field}`}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-label="Save"
        disabled={write.isPending}
        onClick={() => {
          void save();
        }}
      >
        <CheckIcon />
      </Button>
      <Button size="sm" variant="ghost" aria-label="Cancel" onClick={onDone}>
        <XIcon />
      </Button>
    </span>
  );
}

function ReleaseButton({
  metaEventId,
  field,
}: {
  metaEventId: string;
  field: MetaEventOverlayField;
}) {
  const release = useReleaseMetaEventOverlayField();

  async function handleRelease(): Promise<void> {
    try {
      await release.mutateAsync({ id: metaEventId, field });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Released. The sources decide this field again.");
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Hand ${field} back to the sources`}
      disabled={release.isPending}
      onClick={() => {
        void handleRelease();
      }}
    >
      <LockOpenIcon />
    </Button>
  );
}

function FieldRow({
  metaEventId,
  field,
  sources,
}: {
  metaEventId: string;
  field: DriftField;
  sources: MetaEventDrift["sources"];
}) {
  const [claiming, setClaiming] = useState(false);
  const contested = isContested(field);
  const editable = isOverlayField(field.field) ? field.field : null;

  return (
    <tr className="border-b last:border-0">
      <td className="w-1 py-1.5 pr-1">
        {contested && <span className="bg-warning block size-1.5 rounded-full" aria-hidden />}
      </td>
      <td className="text-muted-foreground py-1.5 pr-3 font-mono">
        <span className="flex items-center gap-1.5">
          {field.claimedByOverlay && <LockIcon className="size-3" aria-label="Set by an overlay" />}
          {field.field}
        </span>
      </td>
      {field.bySource.map((cell, index) => (
        <td
          key={sources[index]?.id ?? index}
          className={cn(
            "py-1.5 pr-3 align-top",
            field.claimedByOverlay && "text-muted-foreground/50 line-through",
            contested && cell.value !== field.live && cell.value !== null && "text-warning",
          )}
        >
          <span className="block">{cell.value ?? "—"}</span>
          {cell.raw !== null && cell.raw !== cell.value && (
            <span className="text-muted-foreground text-2xs block">{cell.raw}</span>
          )}
        </td>
      ))}
      <td className="py-1.5 align-top">
        <span className="flex items-center gap-2">
          {claiming && editable !== null ? (
            <ClaimForm
              metaEventId={metaEventId}
              field={editable}
              live={field.live}
              onDone={() => {
                setClaiming(false);
              }}
            />
          ) : (
            <>
              <span className="font-medium">{field.live ?? "—"}</span>
              {field.claimedByOverlay ? (
                <Badge variant="outline">overlay</Badge>
              ) : (
                field.wonBy !== null && <Badge variant="outline">{field.wonBy}</Badge>
              )}
              {editable !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Claim ${field.field} for the archive`}
                  onClick={() => {
                    setClaiming(true);
                  }}
                >
                  <PencilIcon />
                </Button>
              )}
              {editable !== null && field.claimedByOverlay && (
                <ReleaseButton metaEventId={metaEventId} field={editable} />
              )}
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

export function MetaEventDriftPanel({
  metaEventId,
  enabled,
}: {
  metaEventId: string;
  enabled: boolean;
}) {
  const { data, isPending, isError } = useMetaEventDrift(metaEventId, enabled);
  const [showAgreed, setShowAgreed] = useState(false);

  if (isError) {
    return <p className="text-destructive">The drift view could not be loaded.</p>;
  }
  if (isPending || data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (data.sources.length === 0) {
    return (
      <p className="text-muted-foreground">
        No source is linked to this event, so every value here was entered by hand.
      </p>
    );
  }

  const contested = data.fields.filter((field) => isContested(field));
  const agreed = data.fields.filter((field) => !isContested(field));
  const shown = showAgreed ? data.fields : contested;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {data.sources.map((source) => (
          <SourceHeader key={source.id} source={source} />
        ))}
      </div>
      <p className="text-muted-foreground">
        Promotion applies these lowest number first, so the highest wins a field two of them both
        publish. Claiming a field writes an overlay, after which no source wins it again.
      </p>

      {contested.length === 0 && !showAgreed ? (
        <p className="text-muted-foreground">Every field agrees with the archive.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="w-1">
                  <span className="sr-only">Drift</span>
                </th>
                <th className="py-2 pr-3 font-medium">Field</th>
                {data.sources.map((source) => (
                  <th key={source.id} className="py-2 pr-3 font-medium">
                    {sourceProviderDisplay(source.provider ?? source.label).label}
                  </th>
                ))}
                <th className="py-2 font-medium">Live</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((field) => (
                <FieldRow
                  key={field.field}
                  metaEventId={metaEventId}
                  field={field}
                  sources={data.sources}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {agreed.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowAgreed(!showAgreed);
          }}
        >
          {showAgreed ? "Hide" : "Show"} {agreed.length} field
          {agreed.length === 1 ? "" : "s"} that agree
        </Button>
      )}
    </div>
  );
}
