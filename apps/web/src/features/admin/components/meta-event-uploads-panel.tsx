import { formatDay, formatDayTime } from "@openrift/shared/format-date";
import type { MetaUploadSummary } from "@openrift/shared/types/api/meta";
import { ArrowRightLeftIcon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConfirmActionButton,
  ReviewDisclosure,
} from "@/features/admin/components/meta-review-shared";
import {
  useMetaEventMatchSuggestions,
  useMetaEventUploads,
  useMoveMetaEventOverlay,
  useRevertMetaUpload,
} from "@/features/admin/hooks/use-admin-meta-overlays";
import { sourceProviderDisplay } from "@/features/meta/lib/meta-source-review";

function MoveTargets({ eventOverlayId }: { eventOverlayId: string }) {
  const { data, isPending } = useMetaEventMatchSuggestions(eventOverlayId);
  const move = useMoveMetaEventOverlay();

  async function handleMove(metaEventId: string, name: string): Promise<void> {
    try {
      await move.mutateAsync({ id: eventOverlayId, metaEventId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Moved to ${name}.`);
  }

  if (isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (data === undefined) {
    return <p className="text-muted-foreground">The archive could not be searched.</p>;
  }
  if (data.suggestions.length === 0) {
    return (
      <p className="text-muted-foreground">
        No other archived event within {data.windowDays} days looks like this upload.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {data.suggestions.map((suggestion) => (
        <li key={suggestion.metaEventId} className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{suggestion.name}</span>
          <span className="text-muted-foreground tabular-nums">
            {formatDay(suggestion.eventDate)}
          </span>
          <Badge variant="outline">{suggestion.format}</Badge>
          <span className="text-muted-foreground">{suggestion.reasons.join(", ")}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={move.isPending}
            onClick={() => {
              void handleMove(suggestion.metaEventId, suggestion.name);
            }}
          >
            <ArrowRightLeftIcon />
            Move here
          </Button>
        </li>
      ))}
    </ul>
  );
}

function rows(count: number): string {
  return count === 1 ? "row" : "rows";
}

function UploadCard({ upload }: { upload: MetaUploadSummary }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const revert = useRevertMetaUpload();
  const provider = sourceProviderDisplay(upload.provider);
  const summary = `${upload.acceptedPlayers} applied, ${upload.pendingPlayers} still in the queue, ${upload.mintedPlayers} standings ${rows(upload.mintedPlayers)} it minted.`;

  async function handleRevert(): Promise<void> {
    const result = await revert.mutateAsync({
      provider: upload.provider,
      externalId: upload.externalId,
    });
    toast.success(`Reverted ${result.players} standings ${rows(result.players)}.`);
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={provider.variant}>{provider.label}</Badge>
        <span className="text-muted-foreground font-mono text-sm">{upload.externalId}</span>
        <Badge variant={upload.status === "accepted" ? "default" : "outline"}>
          {upload.status}
        </Badge>
        {upload.acceptedAt !== null && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatDayTime(upload.acceptedAt)}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-sm">{summary}</p>

      <ConfirmActionButton
        title={`Revert the ${provider.label} upload?`}
        description="Every overlay this file wrote is rejected and the event is promoted again, which gives back the fields it claimed and removes the standings rows it minted. Nothing is deleted, so the file can be corrected and accepted again."
        confirmLabel="Revert"
        onConfirm={handleRevert}
      >
        <Undo2Icon />
        Revert this upload
      </ConfirmActionButton>

      <ReviewDisclosure title="Move to another event" onOpenChange={setMoveOpen}>
        {moveOpen && <MoveTargets eventOverlayId={upload.eventOverlayId} />}
      </ReviewDisclosure>
    </div>
  );
}

export function MetaEventUploadsPanel({ eventId }: { eventId: string }) {
  const { data } = useMetaEventUploads(eventId);
  const uploads = data?.uploads ?? [];
  if (uploads.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 p-4">
      <Heading level={2}>Uploads</Heading>
      <div className="space-y-2">
        {uploads.map((upload) => (
          <UploadCard key={upload.eventOverlayId} upload={upload} />
        ))}
      </div>
    </section>
  );
}
