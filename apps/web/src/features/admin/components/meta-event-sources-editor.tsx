import type { AdminMetaEventSource } from "@openrift/shared/types/api/meta";
import { LinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SourceCitationsEditor } from "@/features/admin/components/source-citations-editor";
import {
  useAdminMetaEventSources,
  useCreateMetaEventSource,
  useDeleteMetaEventSource,
} from "@/features/admin/hooks/use-admin-meta";

// No provider field: a citation is keyed by (provider, external_id) and owned by its candidate's link.
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
