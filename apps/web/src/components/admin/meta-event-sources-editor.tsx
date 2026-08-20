import type { AdminMetaEventSource } from "@openrift/shared";
import { LinkIcon } from "lucide-react";

import { SourceCitationsEditor } from "@/components/admin/source-citations-editor";
import { Badge } from "@/components/ui/badge";
import {
  useAdminMetaEventSources,
  useCreateMetaEventSource,
  useDeleteMetaEventSource,
} from "@/hooks/use-admin-meta";

/**
 * The event's citation list, as the admin dialog edits it (ADR-014's source
 * citations): what the public event page credits, plus a form for the ones no
 * provider wrote — a VOD, a photo of the standings board, a forum post.
 *
 * There is deliberately no provider field on the form. A provider citation is
 * keyed `(provider, external_id)` and owned by its candidate's link, so a
 * hand-typed one would either collide with that key or outlive the link. That
 * ownership is also why a provider row shows where it came from instead of a
 * delete button: unlinking is what takes it away.
 *
 * @returns The citation editor.
 */
export function MetaEventSourcesEditor({ eventId }: { eventId: string }) {
  const { data, isPending } = useAdminMetaEventSources(eventId);
  const createSource = useCreateMetaEventSource();
  const deleteSource = useDeleteMetaEventSource();

  const sources: AdminMetaEventSource[] = data?.sources ?? [];

  return (
    <SourceCitationsEditor
      citations={sources}
      isPending={isPending}
      description={
        <>
          Every source the event page credits. Linking a candidate writes its provider&apos;s
          citation; add the ones nothing uploaded.
        </>
      }
      emptyText="No citations yet, so the event page shows no source line."
      labelPlaceholder="Twitch VOD"
      idPrefix="meta-source"
      creating={createSource.isPending}
      deleting={deleteSource.isPending}
      onAdd={(input) => createSource.mutateAsync({ eventId, ...input })}
      onDelete={(sourceId) => deleteSource.mutate({ eventId, sourceId })}
      renderBadge={(citation) =>
        citation.provider === null ? null : (
          <Badge variant="muted">
            <LinkIcon className="size-3" />
            {citation.provider}
          </Badge>
        )
      }
      lockedReason={(citation) =>
        citation.provider === null ? null : "Unlink the source to remove"
      }
    />
  );
}
