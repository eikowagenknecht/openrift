import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import { useMemo } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateDistributionChannel,
  useDeleteDistributionChannel,
  useDistributionChannels,
  useReorderDistributionChannels,
  useUpdateDistributionChannel,
} from "@/hooks/use-distribution-channels";
import type { ChannelTreeNode } from "@/lib/distribution-channel-tree";
import { buildChannelTree, canReparent } from "@/lib/distribution-channel-tree";

interface ChannelDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
  kind: DistributionChannelKind;
  parentId: string | null;
  childrenLabel: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/u;
const KIND_LABEL: Record<DistributionChannelKind, string> = {
  event: "Event",
  product: "Product",
};
const ROOT_VALUE = "__root__";

interface LabelCellProps extends AdminCellSlotProps<DistributionChannelResponse> {
  nodeById: Map<string, ChannelTreeNode>;
}

function LabelCell({ row, nodeById }: LabelCellProps) {
  if (!row) {
    return null;
  }
  const node = nodeById.get(row.id);
  const depth = node?.depth ?? 0;
  return (
    <div className="flex items-center gap-2">
      {depth > 0 && (
        <span aria-hidden className="text-muted-foreground/60 select-none">
          {`${"│ ".repeat(depth - 1)}└─`}
        </span>
      )}
      <span className={node?.hasChildren ? "font-semibold" : undefined}>{row.label}</span>
    </div>
  );
}

function SlugCell({ row }: AdminCellSlotProps<DistributionChannelResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono">{row.slug}</span>;
}

interface ParentCellProps extends AdminCellSlotProps<DistributionChannelResponse> {
  labelById: Map<string, string>;
}

function ParentCell({ row, labelById }: ParentCellProps) {
  if (!row) {
    return null;
  }
  if (!row.parentId) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <span className="text-muted-foreground">{labelById.get(row.parentId) ?? row.parentId}</span>
  );
}

function KindCell({ row }: AdminCellSlotProps<DistributionChannelResponse>) {
  if (!row) {
    return null;
  }
  return <span className="capitalize">{KIND_LABEL[row.kind]}</span>;
}

function ChildrenLabelCell({ row }: AdminCellSlotProps<DistributionChannelResponse>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground">
      {row.childrenLabel ?? <span className="text-muted-foreground/60">—</span>}
    </span>
  );
}

function DescriptionCell({ row }: AdminCellSlotProps<DistributionChannelResponse>) {
  if (!row) {
    return null;
  }
  return (
    <span
      className="text-muted-foreground block max-w-xs truncate"
      title={row.description ?? undefined}
    >
      {row.description ?? "—"}
    </span>
  );
}

function PrintingCountCell({ row }: AdminCellSlotProps<DistributionChannelResponse>) {
  if (!row) {
    return null;
  }
  if (row.printingCount === 0) {
    return <span className="text-muted-foreground/60">0</span>;
  }
  return <span>{row.printingCount.toLocaleString()}</span>;
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      className="h-8"
    />
  );
}

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      placeholder="Nexus Night 2025"
      className="h-8"
    />
  );
}

function SlugInput({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
      placeholder="nexus-night-2025"
      className="h-8 w-56 font-mono"
    />
  );
}

interface ParentSelectProps extends AdminDraftSlotProps<ChannelDraft> {
  tree: ChannelTreeNode[];
  channels: DistributionChannelResponse[];
}

function ParentSelect({ draft, setDraft, tree, channels }: ParentSelectProps) {
  if (!draft || !setDraft) {
    return null;
  }
  const sourceForChecks: DistributionChannelResponse =
    draft.id === ""
      ? {
          id: "__draft__",
          slug: "",
          label: "",
          description: null,
          kind: draft.kind,
          sortOrder: 0,
          parentId: null,
          childrenLabel: null,
          createdAt: "",
          updatedAt: "",
          printingCount: 0,
        }
      : (channels.find((c) => c.id === draft.id) ?? {
          id: draft.id,
          slug: draft.slug,
          label: draft.label,
          description: null,
          kind: draft.kind,
          sortOrder: 0,
          parentId: draft.parentId,
          childrenLabel: null,
          createdAt: "",
          updatedAt: "",
          printingCount: 0,
        });
  const eligible = tree.filter((n) => canReparent(sourceForChecks, n.channel.id, tree));
  const value = draft.parentId ?? ROOT_VALUE;
  const items = [
    { value: ROOT_VALUE, label: "(root)" },
    ...eligible.map((n) => ({
      value: n.channel.id,
      label: `${"  ".repeat(n.depth)}${n.channel.label}`,
    })),
  ];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) =>
        setDraft((prev) => ({ ...prev, parentId: next === ROOT_VALUE ? null : (next ?? null) }))
      }
    >
      <SelectTrigger className="h-8 w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function KindEditCell({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  if (draft.parentId !== null) {
    return <span className="text-muted-foreground capitalize">{KIND_LABEL[draft.kind]}</span>;
  }
  return (
    <Select
      value={draft.kind}
      onValueChange={(value) =>
        value && setDraft((prev) => ({ ...prev, kind: value as DistributionChannelKind }))
      }
    >
      <SelectTrigger className="h-8 w-32">
        <SelectValue>{(value: string) => KIND_LABEL[value as DistributionChannelKind]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="event">Event</SelectItem>
        <SelectItem value="product">Product</SelectItem>
      </SelectContent>
    </Select>
  );
}

function KindAddSelect({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Select
      value={draft.kind}
      onValueChange={(value) =>
        value && setDraft((prev) => ({ ...prev, kind: value as DistributionChannelKind }))
      }
    >
      <SelectTrigger className="h-8 w-32">
        <SelectValue>{(value: string) => KIND_LABEL[value as DistributionChannelKind]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="event">Event</SelectItem>
        <SelectItem value="product">Product</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ChildrenLabelInput({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.childrenLabel}
      onChange={(e) => setDraft((prev) => ({ ...prev, childrenLabel: e.target.value }))}
      placeholder="Edition, Placement, Type, …"
      className="h-8"
    />
  );
}

function DescriptionInput({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder="Optional description (markdown links supported)"
      className="h-8"
    />
  );
}

export function DistributionChannelsPage() {
  const { data } = useDistributionChannels();
  const createMutation = useCreateDistributionChannel();
  const updateMutation = useUpdateDistributionChannel();
  const deleteMutation = useDeleteDistributionChannel();
  const reorderMutation = useReorderDistributionChannels();

  const channels = data.distributionChannels;
  const tree = useMemo(() => buildChannelTree(channels), [channels]);
  const orderedChannels = useMemo(() => tree.map((node) => node.channel), [tree]);
  const nodeById = useMemo(() => new Map(tree.map((n) => [n.channel.id, n])), [tree]);
  const labelById = useMemo(() => new Map(channels.map((c) => [c.id, c.label])), [channels]);

  function moveChannel(index: number, direction: -1 | 1) {
    const current = orderedChannels[index];
    if (!current) {
      return;
    }
    // Sibling-scoped reorder: swap with the prev/next channel sharing the same
    // parentId, then submit the full id list (other rows keep their existing
    // sort_order because their relative position in the array is unchanged).
    const sameParent = orderedChannels.filter((c) => c.parentId === current.parentId);
    const siblingIndex = sameParent.findIndex((c) => c.id === current.id);
    const targetIndex = siblingIndex + direction;
    if (targetIndex < 0 || targetIndex >= sameParent.length) {
      return;
    }
    const swapped = [...sameParent];
    [swapped[siblingIndex], swapped[targetIndex]] = [swapped[targetIndex], swapped[siblingIndex]];
    const swappedIterator = swapped.values();
    const reordered = orderedChannels.map((c) =>
      c.parentId === current.parentId ? (swappedIterator.next().value ?? c) : c,
    );
    reorderMutation.mutate(reordered.map((c) => c.id));
  }

  const columns: AdminColumnDef<DistributionChannelResponse, ChannelDraft>[] = [
    {
      header: "Label",
      cell: <LabelCell nodeById={nodeById} />,
      editCell: <LabelInput />,
      addCell: <LabelAddInput />,
    },
    {
      header: "Slug",
      cell: <SlugCell />,
      editCell: <SlugInput />,
      addCell: <SlugInput />,
    },
    {
      header: "Parent",
      cell: <ParentCell labelById={labelById} />,
      editCell: <ParentSelect tree={tree} channels={channels} />,
      addCell: <ParentSelect tree={tree} channels={channels} />,
    },
    {
      header: "Kind",
      cell: <KindCell />,
      editCell: <KindEditCell />,
      addCell: <KindAddSelect />,
    },
    {
      header: "Children label",
      headerTitle:
        "Used as the column header when /promos collapses sparse children into a compact table",
      cell: <ChildrenLabelCell />,
      editCell: <ChildrenLabelInput />,
      addCell: <ChildrenLabelInput />,
    },
    {
      header: "Description",
      cell: <DescriptionCell />,
      editCell: <DescriptionInput />,
      addCell: <DescriptionInput />,
    },
    {
      header: "In use",
      headerTitle: "Number of printings linked to this channel",
      align: "right",
      width: "w-20",
      cell: <PrintingCountCell />,
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={orderedChannels}
      getRowKey={(c) => c.id}
      emptyText="No distribution channels yet."
      toolbar={
        <p className="text-muted-foreground">
          Distribution channels describe where a printing was distributed: tournament events
          (Worlds, prereleases) or retail products (starter decks, bundles). Channels can nest (e.g.
          Regional Event › Houston › Top 1). Printings can only attach to leaf channels.
        </p>
      }
      addChild={{
        toDraft: (parent) => ({
          id: "",
          slug: `${parent.slug}-`,
          label: "",
          description: "",
          kind: parent.kind,
          parentId: parent.id,
          childrenLabel: "",
        }),
        canAddChild: (c) => c.printingCount === 0,
      }}
      add={{
        emptyDraft: {
          id: "",
          slug: "",
          label: "",
          description: "",
          kind: "event" as DistributionChannelKind,
          parentId: null,
          childrenLabel: "",
        },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            description: d.description.trim() || null,
            kind: d.kind,
            parentId: d.parentId,
            childrenLabel: d.childrenLabel.trim() || null,
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!KEBAB_RE.test(slug)) {
            return "Slug must be kebab-case (e.g. nexus-night-2025)";
          }
          return null;
        },
        label: "Add Distribution Channel",
      }}
      edit={{
        toDraft: (c) => ({
          id: c.id,
          slug: c.slug,
          label: c.label,
          description: c.description ?? "",
          kind: c.kind,
          parentId: c.parentId,
          childrenLabel: c.childrenLabel ?? "",
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            slug: d.slug.trim() || undefined,
            label: d.label.trim() || undefined,
            description: d.description.trim() || null,
            kind: d.kind,
            parentId: d.parentId,
            childrenLabel: d.childrenLabel.trim() || null,
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!KEBAB_RE.test(slug)) {
            return "Slug must be kebab-case (e.g. nexus-night-2025)";
          }
          return null;
        },
      }}
      reorder={{
        onMove: moveChannel,
        isPending: reorderMutation.isPending,
      }}
      delete={{
        onDelete: (c) => deleteMutation.mutateAsync({ id: c.id, force: c.printingCount > 0 }),
        confirm: (c) => {
          const hasChildren = nodeById.get(c.id)?.hasChildren ?? false;
          if (hasChildren) {
            return {
              title: `Cannot delete "${c.label}"`,
              description:
                "This channel has child channels. Remove or reparent them before deleting it.",
            };
          }
          if (c.printingCount > 0) {
            return {
              title: `Delete "${c.label}"?`,
              description: `This channel is linked to ${c.printingCount.toLocaleString()} printing${c.printingCount === 1 ? "" : "s"}. Deleting it will unlink it from ${c.printingCount === 1 ? "that printing" : "all of them"}.`,
            };
          }
          return {
            title: `Delete "${c.label}"?`,
            description: "This action cannot be undone.",
          };
        },
      }}
    />
  );
}
