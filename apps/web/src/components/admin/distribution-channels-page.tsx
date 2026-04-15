import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";

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

interface ChannelDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
  kind: DistributionChannelKind;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;
const KIND_LABEL: Record<DistributionChannelKind, string> = {
  event: "Event",
  product: "Product",
};

export function DistributionChannelsPage() {
  const { data } = useDistributionChannels();
  const createMutation = useCreateDistributionChannel();
  const updateMutation = useUpdateDistributionChannel();
  const deleteMutation = useDeleteDistributionChannel();
  const reorderMutation = useReorderDistributionChannels();
  const channels = data.distributionChannels;

  function moveChannel(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= channels.length) {
      return;
    }
    const reordered = channels.map((c) => c.id);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<DistributionChannelResponse, ChannelDraft>[] = [
    {
      header: "Slug",
      sortValue: (c) => c.slug,
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
      header: "Label",
      sortValue: (c) => c.label,
      cell: (c) => <span>{c.label}</span>,
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
      header: "Kind",
      sortValue: (c) => c.kind,
      cell: (c) => <span className="capitalize">{KIND_LABEL[c.kind]}</span>,
      editCell: (d, set) => (
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
      header: "Description",
      sortValue: (c) => c.description ?? "",
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
      data={channels}
      getRowKey={(c) => c.id}
      emptyText="No distribution channels yet."
      toolbar={
        <p className="text-muted-foreground">
          Distribution channels describe where a printing was distributed: tournament events
          (Worlds, prereleases) or retail products (starter decks, bundles). They&apos;re not part
          of printing identity, so the same physical printing can appear at multiple channels.
        </p>
      }
      add={{
        emptyDraft: {
          id: "",
          slug: "",
          label: "",
          description: "",
          kind: "event" as DistributionChannelKind,
        },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            description: d.description.trim() || null,
            kind: d.kind,
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
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            label: d.label.trim() || undefined,
            description: d.description.trim() || null,
            kind: d.kind,
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
