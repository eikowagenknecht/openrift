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
  useCreateSuperType,
  useDeleteSuperType,
  useReorderSuperTypes,
  useSuperTypes,
  useUpdateSuperType,
} from "@/hooks/use-super-types";

interface SuperTypeRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface SuperTypeDraft {
  slug: string;
  label: string;
}

const columns: AdminColumnDef<SuperTypeRow, SuperTypeDraft>[] = [
  {
    header: "Slug",
    sortValue: (superType) => superType.slug,
    cell: <SlugCell<SuperTypeRow> />,
    addCell: <SlugAddInput<SuperTypeDraft> placeholder="champion" />,
  },
  {
    header: "Label",
    sortValue: (superType) => superType.label,
    cell: <LabelCell<SuperTypeRow> />,
    editCell: <LabelInput<SuperTypeDraft> />,
    addCell: <LabelAddInput<SuperTypeDraft> placeholder="Champion" />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell<SuperTypeRow> />,
  },
];

export function SuperTypesPage() {
  const { data } = useSuperTypes();
  const createMutation = useCreateSuperType();
  const updateMutation = useUpdateSuperType();
  const deleteMutation = useDeleteSuperType();
  const reorderMutation = useReorderSuperTypes();
  const { superTypes } = data;

  return (
    <AdminTable
      columns={columns}
      data={superTypes}
      getRowKey={(superType) => superType.slug}
      emptyText="No supertypes yet."
      title="Supertypes"
      toolbar={
        <PageDescription>
          Supertypes are qualifiers applied on top of a card&apos;s type (e.g. Champion, Signature).
        </PageDescription>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) => validateSlugAndLabel(draft.slug, draft.label, "champion, signature"),
        label: "Add Supertype",
      }}
      edit={{
        toDraft: (superType) => ({
          slug: superType.slug,
          label: superType.label,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        moves: flatReorder(superTypes, (superType) => superType.slug),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "super-types.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (superType) => deleteMutation.mutateAsync(superType.slug),
      }}
    />
  );
}
