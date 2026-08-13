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
  useCardTypes,
  useCreateCardType,
  useDeleteCardType,
  useReorderCardTypes,
  useUpdateCardType,
} from "@/hooks/use-card-types";
import { flatReorder } from "@/lib/admin-reorder";

interface CardTypeRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface CardTypeDraft {
  slug: string;
  label: string;
}

const columns: AdminColumnDef<CardTypeRow, CardTypeDraft>[] = [
  {
    header: "Slug",
    sortValue: (cardType) => cardType.slug,
    cell: <SlugCell<CardTypeRow> />,
    addCell: <SlugAddInput<CardTypeDraft> placeholder="unit" />,
  },
  {
    header: "Label",
    sortValue: (cardType) => cardType.label,
    cell: <LabelCell<CardTypeRow> />,
    editCell: <LabelInput<CardTypeDraft> />,
    addCell: <LabelAddInput<CardTypeDraft> placeholder="Unit" />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell<CardTypeRow> />,
  },
];

export function CardTypesPage() {
  const { data } = useCardTypes();
  const createMutation = useCreateCardType();
  const updateMutation = useUpdateCardType();
  const deleteMutation = useDeleteCardType();
  const reorderMutation = useReorderCardTypes();
  const { cardTypes } = data;

  return (
    <AdminTable
      columns={columns}
      data={cardTypes}
      getRowKey={(cardType) => cardType.slug}
      emptyText="No card types yet."
      title="Card Types"
      toolbar={
        <PageDescription>
          Card types categorize cards by their game role (e.g. Unit, Spell, Battlefield, Legend,
          Rune).
        </PageDescription>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) => validateSlugAndLabel(draft.slug, draft.label, "unit, battlefield"),
        label: "Add Card Type",
      }}
      edit={{
        toDraft: (cardType) => ({
          slug: cardType.slug,
          label: cardType.label,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        moves: flatReorder(cardTypes, (cardType) => cardType.slug),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "card-types.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (cardType) => deleteMutation.mutateAsync(cardType.slug),
      }}
    />
  );
}
