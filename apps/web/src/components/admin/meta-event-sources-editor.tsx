import type { AdminMetaEventSource } from "@openrift/shared";
import { LinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAdminMetaEventSources,
  useCreateMetaEventSource,
  useDeleteMetaEventSource,
} from "@/hooks/use-admin-meta";

/**
 * One citation row. A provider row is the link's, not the admin's: linking that
 * provider's candidate wrote it and unlinking is what takes it away, so it has
 * no delete button at all and says where it came from instead.
 *
 * @returns The citation row.
 */
function SourceRow({
  source,
  onDelete,
  deleting,
}: {
  source: AdminMetaEventSource;
  onDelete: (sourceId: string) => void;
  deleting: boolean;
}) {
  const fromLink = source.provider !== null;
  return (
    <li className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{source.label}</span>
          {fromLink && (
            <Badge variant="muted">
              <LinkIcon className="size-3" />
              {source.provider}
            </Badge>
          )}
        </div>
        {source.sourceUrl !== null && (
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground block truncate text-sm underline underline-offset-2"
          >
            {source.sourceUrl}
          </a>
        )}
      </div>
      {fromLink ? (
        <span className="text-muted-foreground shrink-0 text-sm">Unlink the source to remove</span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete citation ${source.label}`}
          disabled={deleting}
          onClick={() => onDelete(source.id)}
        >
          <Trash2Icon className="size-4" />
        </Button>
      )}
    </li>
  );
}

/**
 * The event's citation list, as the admin dialog edits it (ADR-014's source
 * citations): what the public event page credits, plus a form for the ones no
 * provider wrote — a VOD, a photo of the standings board, a forum post.
 *
 * There is deliberately no provider field on the form. A provider citation is
 * keyed `(provider, external_id)` and owned by its candidate's link, so a
 * hand-typed one would either collide with that key or outlive the link.
 *
 * @returns The citation editor.
 */
export function MetaEventSourcesEditor({ eventId }: { eventId: string }) {
  const { data, isPending } = useAdminMetaEventSources(eventId);
  const createSource = useCreateMetaEventSource();
  const deleteSource = useDeleteMetaEventSource();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const sources = data?.sources ?? [];
  const trimmedLabel = label.trim();

  async function handleAdd() {
    // Resolved before the try: the React Compiler cannot lower a conditional
    // that sits inside one.
    const trimmedUrl = url.trim();
    const sourceUrl = trimmedUrl.length > 0 ? trimmedUrl : null;
    try {
      await createSource.mutateAsync({ eventId, label: trimmedLabel, sourceUrl });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    setLabel("");
    setUrl("");
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>Citations</Label>
        <p className="text-muted-foreground text-sm">
          Every source the event page credits. Linking a candidate writes its provider&apos;s
          citation; add the ones nothing uploaded.
        </p>
      </div>

      {isPending && <p className="text-muted-foreground text-sm">Loading citations…</p>}
      {!isPending && sources.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No citations yet, so the event page shows no source line.
        </p>
      )}
      {sources.length > 0 && (
        <ul className="rounded-md border px-3">
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              deleting={deleteSource.isPending}
              onDelete={(sourceId) => deleteSource.mutate({ eventId, sourceId })}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="meta-source-label">Label</Label>
          <Input
            id="meta-source-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Twitch VOD"
          />
        </div>
        <div className="min-w-40 flex-2 space-y-1.5">
          <Label htmlFor="meta-source-url">Link</Label>
          <Input
            id="meta-source-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <Button
          variant="outline"
          disabled={trimmedLabel.length === 0 || createSource.isPending}
          onClick={handleAdd}
        >
          <PlusIcon />
          Add citation
        </Button>
      </div>
    </div>
  );
}
