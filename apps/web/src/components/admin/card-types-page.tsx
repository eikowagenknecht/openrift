import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCardTypes,
  useCreateCardType,
  useDeleteCardType,
  useReorderCardTypes,
  useUpdateCardType,
} from "@/hooks/use-card-types";
import { isValidSlug } from "@/lib/admin-slug";

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

function SlugCell({ row }: AdminCellSlotProps<CardTypeRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<CardTypeRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function WellKnownCell({ row }: AdminCellSlotProps<CardTypeRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<CardTypeDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) =>
        setDraft((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))
      }
      placeholder="unit"
      className="h-8 w-40 font-mono"
    />
  );
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<CardTypeDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      className="h-8"
    />
  );
}

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<CardTypeDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder="Unit"
      className="h-8"
    />
  );
}

const columns: AdminColumnDef<CardTypeRow, CardTypeDraft>[] = [
  {
    header: "Slug",
    sortValue: (cardType) => cardType.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    sortValue: (cardType) => cardType.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell />,
  },
];

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
          if (!isValidSlug(slug)) {
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
