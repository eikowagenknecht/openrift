import { SourceCitationsEditor } from "@/components/admin/source-citations-editor";
import {
  useAdminPrintingCitations,
  useCreatePrintingCitation,
  useDeletePrintingCitation,
} from "@/hooks/use-admin-printing-citations";

/**
 * The printing's citation list, as the admin card page edits it: the videos and
 * posts backing what the catalog claims about where this card came from, shown
 * on the public card page under "Sources".
 *
 * Unlike the meta archive's equivalent, every row here is hand-entered —
 * nothing ingests citations — so no row is owned by a link and none refuses a
 * delete.
 *
 * @returns The citation editor.
 */
export function PrintingCitationsEditor({ printingId }: { printingId: string }) {
  const { data, isPending } = useAdminPrintingCitations(printingId);
  const createCitation = useCreatePrintingCitation();
  const deleteCitation = useDeletePrintingCitation();

  return (
    <SourceCitationsEditor
      citations={data?.citations ?? []}
      isPending={isPending}
      description="Where this printing's promo claims come from. Shown on the public card page; the icon comes from the link's host, not the label."
      emptyText="No citations yet, so the card page shows no source line."
      labelPlaceholder="Launch party unboxing (RiftboundDaily)"
      idPrefix={`printing-citation-${printingId}`}
      creating={createCitation.isPending}
      deleting={deleteCitation.isPending}
      onAdd={(input) => createCitation.mutateAsync({ printingId, ...input })}
      onDelete={(citationId) => deleteCitation.mutate({ printingId, citationId })}
    />
  );
}
