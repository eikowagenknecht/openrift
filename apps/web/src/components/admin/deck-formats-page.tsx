import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreateDeckFormat,
  useDeckFormats,
  useDeleteDeckFormat,
  useReorderDeckFormats,
  useUpdateDeckFormat,
} from "@/hooks/use-deck-formats";

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

  const columns: AdminColumnDef<DeckFormatRow, DeckFormatDraft>[] = [
    {
      header: "Slug",
      sortValue: (deckFormat) => deckFormat.slug,
      cell: (deckFormat) => <span className="font-mono text-sm">{deckFormat.slug}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.slug}
          onChange={(event) => set((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))}
          placeholder="constructed"
          className="h-8 w-40 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (deckFormat) => deckFormat.label,
      cell: (deckFormat) => <span className="text-sm">{deckFormat.label}</span>,
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
          placeholder="Constructed"
          className="h-8"
        />
      ),
    },
    {
      header: "Well-known",
      cell: (deckFormat) => (
        <span className="text-muted-foreground text-sm">
          {deckFormat.isWellKnown ? "Yes" : "No"}
        </span>
      ),
    },
  ];

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
          if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
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
