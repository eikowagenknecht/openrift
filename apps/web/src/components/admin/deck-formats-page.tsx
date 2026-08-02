import {
  LabelAddInput,
  LabelCell,
  LabelInput,
  SlugAddInput,
  SlugCell,
  validateSlugAndLabel,
  WellKnownCell,
} from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import {
  useCreateDeckFormat,
  useDeckFormats,
  useDeleteDeckFormat,
  useReorderDeckFormats,
  useUpdateDeckFormat,
} from "@/hooks/use-deck-formats";
import { swapForReorder } from "@/lib/admin-reorder";

interface DeckFormatRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface DeckFormatDraft {
  slug: string;
  label: string;
}

const columns: AdminColumnDef<DeckFormatRow, DeckFormatDraft>[] = [
  {
    header: "Slug",
    sortValue: (deckFormat) => deckFormat.slug,
    cell: <SlugCell<DeckFormatRow> />,
    addCell: <SlugAddInput<DeckFormatDraft> placeholder="constructed" />,
  },
  {
    header: "Label",
    sortValue: (deckFormat) => deckFormat.label,
    cell: <LabelCell<DeckFormatRow> />,
    editCell: <LabelInput<DeckFormatDraft> />,
    addCell: <LabelAddInput<DeckFormatDraft> placeholder="Constructed" />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell<DeckFormatRow> />,
  },
];

export function DeckFormatsPage() {
  const { data } = useDeckFormats();
  const createMutation = useCreateDeckFormat();
  const updateMutation = useUpdateDeckFormat();
  const deleteMutation = useDeleteDeckFormat();
  const reorderMutation = useReorderDeckFormats();
  const { deckFormats } = data;

  function moveDeckFormat(index: number, direction: -1 | 1) {
    const reordered = swapForReorder(deckFormats, index, direction, (format) => format.slug);
    if (reordered) {
      reorderMutation.mutate(reordered);
    }
  }

  return (
    <AdminTable
      columns={columns}
      data={deckFormats}
      getRowKey={(deckFormat) => deckFormat.slug}
      emptyText="No deck formats yet."
      title="Deck Formats"
      toolbar={
        <PageDescription>
          Deck formats describe the construction rules a deck follows (e.g. Constructed, Freeform).
        </PageDescription>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) => validateSlugAndLabel(draft.slug, draft.label, "constructed, freeform"),
        label: "Add Deck Format",
      }}
      edit={{
        toDraft: (deckFormat) => ({
          slug: deckFormat.slug,
          label: deckFormat.label,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        onMove: moveDeckFormat,
        isPending: reorderMutation.isPending,
      }}
      delete={{
        onDelete: (deckFormat) => deleteMutation.mutateAsync(deckFormat.slug),
      }}
    />
  );
}
