import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useCreateDomain,
  useDeleteDomain,
  useDomains,
  useReorderDomains,
  useUpdateDomain,
} from "@/hooks/use-domains";
import { contrastText } from "@/lib/color";

interface DomainRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
  color: string | null;
}

interface DomainDraft {
  slug: string;
  label: string;
  color: string;
}

export function DomainsPage() {
  const { data } = useDomains();
  const createMutation = useCreateDomain();
  const updateMutation = useUpdateDomain();
  const deleteMutation = useDeleteDomain();
  const reorderMutation = useReorderDomains();
  const { domains } = data;

  function moveDomain(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= domains.length) {
      return;
    }
    const reordered = domains.map((domain) => domain.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<DomainRow, DomainDraft>[] = [
    {
      header: "Slug",
      width: "w-40",
      sortValue: (domain) => domain.slug,
      cell: (domain) => <span className="font-mono text-sm">{domain.slug}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.slug}
          onChange={(event) => set((prev) => ({ ...prev, slug: event.target.value }))}
          placeholder="NewDomain"
          className="h-8 w-40 font-mono"
        />
      ),
    },
    {
      header: "Label",
      width: "w-40",
      sortValue: (domain) => domain.label,
      cell: (domain) => <span className="text-sm">{domain.label}</span>,
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
          placeholder="New Domain"
          className="h-8"
        />
      ),
    },
    {
      header: "Color",
      width: "w-36",
      cell: (domain) =>
        domain.color ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-4 rounded border"
              style={{ backgroundColor: domain.color }}
            />
            <span className="font-mono text-sm">{domain.color}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      editCell: (draft, set) => (
        <Input
          value={draft.color}
          onChange={(event) => set((prev) => ({ ...prev, color: event.target.value }))}
          placeholder="#CB212D"
          className="h-8 w-28 font-mono"
        />
      ),
      addCell: (draft, set) => (
        <Input
          value={draft.color}
          onChange={(event) => set((prev) => ({ ...prev, color: event.target.value }))}
          placeholder="#CB212D"
          className="h-8 w-28 font-mono"
        />
      ),
    },
    {
      header: "Preview",
      width: "w-28",
      cell: (domain) => (
        <Badge
          style={
            domain.color
              ? { backgroundColor: domain.color, color: contrastText(domain.color) }
              : undefined
          }
          variant={domain.color ? "default" : "secondary"}
        >
          {domain.label}
        </Badge>
      ),
    },
    {
      header: "Well-known",
      width: "w-24",
      cell: (domain) => (
        <span className="text-muted-foreground text-sm">{domain.isWellKnown ? "Yes" : "No"}</span>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={domains}
      getRowKey={(domain) => domain.slug}
      emptyText="No domains yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Domains are the color identities for cards (e.g. Fury, Calm, Mind). Colors are shown
          throughout the UI wherever domains appear.
        </p>
      }
      add={{
        emptyDraft: { slug: "", label: "", color: "#737373" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            color: draft.color.trim() || null,
          }),
        validate: (draft) => {
          const slug = draft.slug.trim();
          const label = draft.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          const color = draft.color.trim();
          if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
            return "Color must be a hex code (e.g. #CB212D)";
          }
          return null;
        },
        label: "Add Domain",
      }}
      edit={{
        toDraft: (domain) => ({
          slug: domain.slug,
          label: domain.label,
          color: domain.color ?? "",
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
            color: draft.color.trim() || null,
          }),
      }}
      reorder={{
        onMove: moveDomain,
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "domains.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (domain) => deleteMutation.mutateAsync(domain.slug),
      }}
    />
  );
}
