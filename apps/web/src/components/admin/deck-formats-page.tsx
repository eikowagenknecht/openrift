import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreateDeckFormat,
  useDeckFormats,
  useDeleteDeckFormat,
  useReorderDeckFormats,
  useUpdateDeckFormat,
} from "@/hooks/use-deck-formats";
import { isValidSlug } from "@/lib/admin-slug";

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

function SlugCell({ row }: AdminCellSlotProps<DeckFormatRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<DeckFormatRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function WellKnownCell({ row }: AdminCellSlotProps<DeckFormatRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<DeckFormatDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) =>
        setDraft((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))
      }
      placeholder="constructed"
      className="h-8 w-40 font-mono"
    />
  );
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<DeckFormatDraft>) {
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

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<DeckFormatDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder="Constructed"
      className="h-8"
    />
  );
}

const columns: AdminColumnDef<DeckFormatRow, DeckFormatDraft>[] = [
  {
    header: "Slug",
    sortValue: (deckFormat) => deckFormat.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    sortValue: (deckFormat) => deckFormat.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell />,
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
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= deckFormats.length) {
      return;
    }
    const reordered = deckFormats.map((deckFormat) => deckFormat.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <AdminTable
      columns={columns}
      data={deckFormats}
      getRowKey={(deckFormat) => deckFormat.slug}
      emptyText="No deck formats yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Deck formats describe the construction rules a deck follows (e.g. Constructed, Freeform).
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
            return "Slug must be kebab-case (e.g. constructed, freeform)";
          }
          return null;
        },
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
