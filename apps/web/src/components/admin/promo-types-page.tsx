import type { PromoTypeResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreatePromoType,
  useDeletePromoType,
  usePromoTypes,
  useReorderPromoTypes,
  useUpdatePromoType,
} from "@/hooks/use-promo-types";

interface PromoTypeDraft {
  id: string;
  slug: string;
  label: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;

export function PromoTypesPage() {
  const { data } = usePromoTypes();
  const createMutation = useCreatePromoType();
  const updateMutation = useUpdatePromoType();
  const deleteMutation = useDeletePromoType();
  const reorderMutation = useReorderPromoTypes();
  const { promoTypes } = data;

  function movePromoType(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= promoTypes.length) {
      return;
    }
    const reordered = promoTypes.map((pt) => pt.id);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<PromoTypeResponse, PromoTypeDraft>[] = [
    {
      header: "Slug",
      sortValue: (pt) => pt.slug,
      cell: (pt) => <span className="font-mono text-sm">{pt.slug}</span>,
      addCell: (d, set) => (
        <Input
          value={d.slug}
          onChange={(e) => set((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
          placeholder="nexus-night"
          className="h-8 w-48 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (pt) => pt.label,
      cell: (pt) => <span className="text-sm">{pt.label}</span>,
      editCell: (d, set) => (
        <Input
          value={d.label}
          onChange={(e) => set((prev) => ({ ...prev, label: e.target.value }))}
          className="h-8"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.label}
          onChange={(e) => set((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Nexus Night"
          className="h-8"
        />
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={promoTypes}
      getRowKey={(pt) => pt.id}
      emptyText="No promo types yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Promo types classify promotional printings (e.g. Summoner Skirmish, Nexus Night).
        </p>
      }
      add={{
        emptyDraft: { id: "", slug: "", label: "" },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!KEBAB_RE.test(slug)) {
            return "Slug must be kebab-case (e.g. nexus-night)";
          }
          return null;
        },
        label: "Add Promo Type",
      }}
      edit={{
        toDraft: (pt) => ({
          id: pt.id,
          slug: pt.slug,
          label: pt.label,
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            label: d.label.trim() || undefined,
          }),
      }}
      reorder={{
        onMove: movePromoType,
        isPending: reorderMutation.isPending,
      }}
      delete={{
        onDelete: (pt) => deleteMutation.mutateAsync(pt.id),
      }}
    />
  );
}
