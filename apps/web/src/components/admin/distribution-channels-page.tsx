import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import { useMemo } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
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

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;
const KIND_LABEL: Record<DistributionChannelKind, string> = {
  event: "Event",
  product: "Product",
};
const ROOT_VALUE = "__root__";

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

  function renderParentSelect(
    draft: ChannelDraft,
    set: (fn: (prev: ChannelDraft) => ChannelDraft) => void,
  ) {
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
          });
    const eligible = tree.filter((n) => canReparent(sourceForChecks, n.channel.id, tree));
    const value = draft.parentId ?? ROOT_VALUE;
    const items = [
      { value: ROOT_VALUE, label: "(root)" },
      ...eligible.map((n) => ({
        value: n.channel.id,
        label: `${"\u00A0\u00A0".repeat(n.depth)}${n.channel.label}`,
      })),
    ];
    return (
      <Select
        items={items}
        value={value}
        onValueChange={(next) =>
          set((prev) => ({ ...prev, parentId: next === ROOT_VALUE ? null : (next ?? null) }))
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

  const columns: AdminColumnDef<DistributionChannelResponse, ChannelDraft>[] = [
    {
      header: "Label",
      cell: (c) => {
        const node = nodeById.get(c.id);
        const depth = node?.depth ?? 0;
        return (
          <div className="flex items-center gap-2">
            {depth > 0 && (
              <span aria-hidden className="text-muted-foreground/60 select-none">
                {"\u2502\u00A0".repeat(depth - 1)}
                {"\u2514\u2500"}
              </span>
            )}
            <span className={node?.hasChildren ? "font-semibold" : undefined}>{c.label}</span>
          </div>
        );
      },
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
          placeholder="Nexus Night 2025"
          className="h-8"
        />
      ),
    },
    {
      header: "Slug",
      cell: (c) => <span className="font-mono">{c.slug}</span>,
      addCell: (d, set) => (
        <Input
          value={d.slug}
          onChange={(e) => set((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
          placeholder="nexus-night-2025"
          className="h-8 w-56 font-mono"
        />
      ),
    },
    {
      header: "Parent",
      cell: (c) =>
        c.parentId ? (
          <span className="text-muted-foreground">{labelById.get(c.parentId) ?? c.parentId}</span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        ),
      editCell: renderParentSelect,
      addCell: renderParentSelect,
    },
    {
      header: "Kind",
      cell: (c) => <span className="capitalize">{KIND_LABEL[c.kind]}</span>,
      editCell: (d, set) => {
        if (d.parentId !== null) {
          return <span className="text-muted-foreground capitalize">{KIND_LABEL[d.kind]}</span>;
        }
        return (
          <Select
            value={d.kind}
            onValueChange={(value) =>
              value && set((prev) => ({ ...prev, kind: value as DistributionChannelKind }))
            }
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue>
                {(value: string) => KIND_LABEL[value as DistributionChannelKind]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="product">Product</SelectItem>
            </SelectContent>
          </Select>
        );
      },
      addCell: (d, set) => (
        <Select
          value={d.kind}
          onValueChange={(value) =>
            value && set((prev) => ({ ...prev, kind: value as DistributionChannelKind }))
          }
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue>
              {(value: string) => KIND_LABEL[value as DistributionChannelKind]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event">Event</SelectItem>
            <SelectItem value="product">Product</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      header: "Children label",
      headerTitle:
        "Used as the column header when /promos collapses sparse children into a compact table",
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.childrenLabel ?? <span className="text-muted-foreground/60">—</span>}
        </span>
      ),
      editCell: (d, set) => (
        <Input
          value={d.childrenLabel}
          onChange={(e) => set((prev) => ({ ...prev, childrenLabel: e.target.value }))}
          placeholder="Edition, Placement, Type, …"
          className="h-8"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.childrenLabel}
          onChange={(e) => set((prev) => ({ ...prev, childrenLabel: e.target.value }))}
          placeholder="Edition, Placement, Type, …"
          className="h-8"
        />
      ),
    },
    {
      header: "Description",
      cell: (c) => (
        <span
          className="text-muted-foreground block max-w-xs truncate"
          title={c.description ?? undefined}
        >
          {c.description ?? "—"}
        </span>
      ),
      editCell: (d, set) => (
        <Input
          value={d.description}
          onChange={(e) => set((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional description (markdown links supported)"
          className="h-8"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.description}
          onChange={(e) => set((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional description (markdown links supported)"
          className="h-8"
        />
      ),
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
            label: d.label.trim() || undefined,
            description: d.description.trim() || null,
            kind: d.kind,
            parentId: d.parentId,
            childrenLabel: d.childrenLabel.trim() || null,
          }),
      }}
      reorder={{
        onMove: moveChannel,
        isPending: reorderMutation.isPending,
      }}
      delete={{
        onDelete: (c) => deleteMutation.mutateAsync(c.id),
      }}
    />
  );
}
