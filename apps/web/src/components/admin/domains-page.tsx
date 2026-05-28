import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
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

function SlugCell({ row }: AdminCellSlotProps<DomainRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<DomainRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function ColorCell({ row }: AdminCellSlotProps<DomainRow>) {
  if (!row) {
    return null;
  }
  if (!row.color) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block size-4 rounded border" style={{ backgroundColor: row.color }} />
      <span className="font-mono text-sm">{row.color}</span>
    </div>
  );
}

function PreviewCell({ row }: AdminCellSlotProps<DomainRow>) {
  if (!row) {
    return null;
  }
  return (
    <Badge
      style={row.color ? { backgroundColor: row.color, color: contrastText(row.color) } : undefined}
      variant={row.color ? "default" : "secondary"}
    >
      {row.label}
    </Badge>
  );
}

function WellKnownCell({ row }: AdminCellSlotProps<DomainRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<DomainDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
      placeholder="NewDomain"
      className="h-8 w-40 font-mono"
    />
  );
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<DomainDraft>) {
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

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<DomainDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder="New Domain"
      className="h-8"
    />
  );
}

function ColorInput({ draft, setDraft }: AdminDraftSlotProps<DomainDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.color}
      onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
      placeholder="#CB212D"
      className="h-8 w-28 font-mono"
    />
  );
}

const columns: AdminColumnDef<DomainRow, DomainDraft>[] = [
  {
    header: "Slug",
    width: "w-40",
    sortValue: (domain) => domain.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    width: "w-40",
    sortValue: (domain) => domain.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Color",
    width: "w-36",
    cell: <ColorCell />,
    editCell: <ColorInput />,
    addCell: <ColorInput />,
  },
  {
    header: "Preview",
    width: "w-28",
    cell: <PreviewCell />,
  },
  {
    header: "Well-known",
    width: "w-24",
    cell: <WellKnownCell />,
  },
];

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
          if (color && !/^#[0-9a-fA-F]{6}$/u.test(color)) {
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
