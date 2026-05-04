import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCardTypes,
  useCreateCardType,
  useDeleteCardType,
  useReorderCardTypes,
  useUpdateCardType,
} from "@/hooks/use-card-types";

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

export function CardTypesPage() {
  const { data } = useCardTypes();
  const createMutation = useCreateCardType();
  const updateMutation = useUpdateCardType();
  const deleteMutation = useDeleteCardType();
  const reorderMutation = useReorderCardTypes();
  const { cardTypes } = data;

  function moveCardType(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= cardTypes.length) {
      return;
    }
    const reordered = cardTypes.map((cardType) => cardType.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<CardTypeRow, CardTypeDraft>[] = [
    {
      header: "Slug",
      sortValue: (cardType) => cardType.slug,
      cell: (cardType) => <span className="font-mono text-sm">{cardType.slug}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.slug}
          onChange={(event) => set((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))}
          placeholder="unit"
          className="h-8 w-40 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (cardType) => cardType.label,
      cell: (cardType) => <span className="text-sm">{cardType.label}</span>,
      editCell: (draft, set) => (
        <Input
          value={draft.label}
          onChange={(event) => set((prev) => ({ ...prev, label: event.target.value }))}
          className="h-8"
        />
      ),
      addCell: (draft, set) => (
        <Input
          value={draft.label}
          onChange={(event) => set((prev) => ({ ...prev, label: event.target.value }))}
          placeholder="Unit"
          className="h-8"
        />
      ),
    },
    {
      header: "Well-known",
      cell: (cardType) => (
        <span className="text-muted-foreground text-sm">{cardType.isWellKnown ? "Yes" : "No"}</span>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={cardTypes}
      getRowKey={(cardType) => cardType.slug}
      emptyText="No card types yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Card types categorize cards by their game role (e.g. Unit, Spell, Battlefield, Legend,
          Rune).
        </p>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) => {
          const slug = draft.slug.trim();
          const label = draft.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
            return "Slug must be kebab-case (e.g. unit, battlefield)";
          }
          return null;
        },
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
        onMove: moveCardType,
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
