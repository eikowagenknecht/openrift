import { PageDescription } from "@/components/layout/page-top-bar";
import {
  LabelAddInput,
  LabelCell,
  LabelInput,
  SlugAddInput,
  SlugCell,
  validateSlugAndLabel,
  WellKnownCell,
} from "@/features/admin/components/admin-crud-shared";
import { AdminTable } from "@/features/admin/components/admin-table";
import type { AdminColumnDef } from "@/features/admin/components/admin-table";
import { flatReorder } from "@/features/admin/lib/admin-reorder";
import {
  useCreateFinish,
  useDeleteFinish,
  useFinishes,
  useReorderFinishes,
  useUpdateFinish,
} from "@/hooks/use-finishes";

interface FinishRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface FinishDraft {
  slug: string;
  label: string;
}

const columns: AdminColumnDef<FinishRow, FinishDraft>[] = [
  {
    header: "Slug",
    sortValue: (finish) => finish.slug,
    cell: <SlugCell<FinishRow> />,
    addCell: <SlugAddInput<FinishDraft> placeholder="foil" />,
  },
  {
    header: "Label",
    sortValue: (finish) => finish.label,
    cell: <LabelCell<FinishRow> />,
    editCell: <LabelInput<FinishDraft> />,
    addCell: <LabelAddInput<FinishDraft> placeholder="Foil" />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell<FinishRow> />,
  },
];

export function FinishesPage() {
  const { data } = useFinishes();
  const createMutation = useCreateFinish();
  const updateMutation = useUpdateFinish();
  const deleteMutation = useDeleteFinish();
  const reorderMutation = useReorderFinishes();
  const { finishes } = data;

  return (
    <AdminTable
      columns={columns}
      data={finishes}
      getRowKey={(finish) => finish.slug}
      emptyText="No finishes yet."
      title="Finishes"
      toolbar={
        <PageDescription>
          Finishes describe the physical treatment of a card (e.g. Non-Foil, Foil, Etched).
        </PageDescription>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) => validateSlugAndLabel(draft.slug, draft.label, "foil, non-foil"),
        label: "Add Finish",
      }}
      edit={{
        toDraft: (finish) => ({
          slug: finish.slug,
          label: finish.label,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        moves: flatReorder(finishes, (finish) => finish.slug),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "finishes.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (finish) => deleteMutation.mutateAsync(finish.slug),
      }}
    />
  );
}
