import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
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

export function FinishesPage() {
  const { data } = useFinishes();
  const createMutation = useCreateFinish();
  const updateMutation = useUpdateFinish();
  const deleteMutation = useDeleteFinish();
  const reorderMutation = useReorderFinishes();
  const { finishes } = data;

  function moveFinish(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= finishes.length) {
      return;
    }
    const reordered = finishes.map((finish) => finish.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<FinishRow, FinishDraft>[] = [
    {
      header: "Slug",
      sortValue: (finish) => finish.slug,
      cell: (finish) => <span className="font-mono text-sm">{finish.slug}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.slug}
          onChange={(event) => set((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))}
          placeholder="foil"
          className="h-8 w-40 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (finish) => finish.label,
      cell: (finish) => <span className="text-sm">{finish.label}</span>,
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
          placeholder="Foil"
          className="h-8"
        />
      ),
    },
    {
      header: "Well-known",
      cell: (finish) => (
        <span className="text-muted-foreground text-sm">{finish.isWellKnown ? "Yes" : "No"}</span>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={finishes}
      getRowKey={(finish) => finish.slug}
      emptyText="No finishes yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Finishes describe the physical treatment of a card (e.g. Non-Foil, Foil, Etched).
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
            return "Slug must be kebab-case (e.g. foil, non-foil)";
          }
          return null;
        },
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
        onMove: moveFinish,
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
