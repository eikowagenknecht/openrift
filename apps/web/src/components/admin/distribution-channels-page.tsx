import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";

import {
  DescriptionCell,
  DescriptionInput,
  LabelAddInput,
  LabelInput,
  SlugAddInput,
  SlugCell,
  validateSlugAndLabel,
} from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
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
import { treeReorder } from "@/lib/admin-reorder";
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

function PrintingCountCell({ row }: AdminCellSlotProps<DistributionChannelResponse>) {
  if (!row) {
    return null;
  }
  if (row.printingCount === 0) {
    return <span className="text-muted-foreground/60">0</span>;
  }
  return <span>{row.printingCount.toLocaleString()}</span>;
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

function KindSelect({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
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

function KindEditCell({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  if (draft.parentId !== null) {
    return <span className="text-muted-foreground capitalize">{KIND_LABEL[draft.kind]}</span>;
  }
  return <KindSelect draft={draft} setDraft={setDraft} />;
}

function KindAddSelect({ draft, setDraft }: AdminDraftSlotProps<ChannelDraft>) {
  return <KindSelect draft={draft} setDraft={setDraft} />;
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

export function DistributionChannelsPage() {
  const { data } = useDistributionChannels();
  const createMutation = useCreateDistributionChannel();
  const updateMutation = useUpdateDistributionChannel();
  const deleteMutation = useDeleteDistributionChannel();
  const reorderMutation = useReorderDistributionChannels();

  const channels = data.distributionChannels;
  const tree = buildChannelTree(channels);
  const orderedChannels = tree.map((node) => node.channel);
  const nodeById = new Map(tree.map((n) => [n.channel.id, n]));
  const labelById = new Map(channels.map((c) => [c.id, c.label]));

  // A channel moves only among its own siblings, taking its children along.
  // orderedChannels must stay depth-first so a subtree is a contiguous block.
  const reorderMoves = treeReorder(
    orderedChannels,
    (channel) => channel.id,
    (channel) => channel.parentId,
  );

  const columns: AdminColumnDef<DistributionChannelResponse, ChannelDraft>[] = [
    {
      header: "Label",
      cell: <LabelCell nodeById={nodeById} />,
      editCell: <LabelInput<ChannelDraft> />,
      addCell: <LabelAddInput<ChannelDraft> placeholder="Nexus Night 2025" />,
    },
    {
      header: "Slug",
      cell: <SlugCell<DistributionChannelResponse> />,
      editCell: <SlugAddInput<ChannelDraft> placeholder="nexus-night-2025" width="w-56" />,
      addCell: <SlugAddInput<ChannelDraft> placeholder="nexus-night-2025" width="w-56" />,
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
      cell: <DescriptionCell<DistributionChannelResponse> />,
      editCell: (
        <DescriptionInput<ChannelDraft> placeholder="Optional description (markdown links supported)" />
      ),
      addCell: (
        <DescriptionInput<ChannelDraft> placeholder="Optional description (markdown links supported)" />
      ),
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
      title="Distribution Channels"
      toolbar={
        <PageDescription>
          Where a printing was distributed. Channels can nest, and printings attach only to leaf
          channels.
        </PageDescription>
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
        validate: (d) => validateSlugAndLabel(d.slug, d.label, "nexus-night-2025"),
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
        validate: (d) => validateSlugAndLabel(d.slug, d.label, "nexus-night-2025"),
      }}
      reorder={{
        moves: reorderMoves,
        onReorder: (ids) => reorderMutation.mutateAsync(ids),
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
