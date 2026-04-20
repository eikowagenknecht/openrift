import type { AdminSetResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { CountBadge } from "@/components/admin/count-badge";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useCreateSet,
  useDeleteSet,
  useReorderSets,
  useSets,
  useUpdateSet,
} from "@/hooks/use-sets";

interface SetDraft {
  id: string;
  name: string;
  printedTotal: string;
  releasedAt: string;
  released: boolean;
  setType: "main" | "supplemental";
}

export function SetsPage() {
  const { data } = useSets();
  const updateMutation = useUpdateSet();
  const createMutation = useCreateSet();
  const reorderMutation = useReorderSets();
  const deleteMutation = useDeleteSet();
  const { sets } = data;

  function moveSet(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sets.length) {
      return;
    }
    const reordered = sets.map((s) => s.id);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<AdminSetResponse, SetDraft>[] = [
    {
      header: "ID",
      width: "w-28",
      cell: (s) => <span className="font-mono">{s.slug}</span>,
      addCell: (d, set) => (
        <Input
          value={d.id}
          onChange={(e) => set((prev) => ({ ...prev, id: e.target.value }))}
          placeholder="ID"
          className="font-mono"
        />
      ),
    },
    {
      header: "Name",
      cell: (s) => s.name,
      editCell: (d, set) => (
        <Input
          value={d.name}
          onChange={(e) => set((prev) => ({ ...prev, name: e.target.value }))}
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.name}
          onChange={(e) => set((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Name"
        />
      ),
    },
    {
      header: "Printed Total",
      width: "w-32",
      align: "right",
      cell: (s) => s.printedTotal,
      editCell: (d, set) => (
        <Input
          inputMode="numeric"
          value={d.printedTotal}
          onChange={(e) => set((prev) => ({ ...prev, printedTotal: e.target.value }))}
          className="ml-auto text-right"
        />
      ),
      addCell: (d, set) => (
        <Input
          inputMode="numeric"
          value={d.printedTotal}
          onChange={(e) => set((prev) => ({ ...prev, printedTotal: e.target.value }))}
          placeholder="0"
          className="ml-auto text-right"
        />
      ),
    },
    {
      header: "Release Date",
      width: "w-36",
      cell: (s) => <span className="text-muted-foreground font-mono">{s.releasedAt ?? "—"}</span>,
      editCell: (d, set) => (
        <DatePicker
          value={d.releasedAt || null}
          onChange={(iso) => set((prev) => ({ ...prev, releasedAt: iso }))}
          onClear={() => set((prev) => ({ ...prev, releasedAt: "" }))}
          className="font-mono"
        />
      ),
      addCell: (d, set) => (
        <DatePicker
          value={d.releasedAt || null}
          onChange={(iso) => set((prev) => ({ ...prev, releasedAt: iso }))}
          onClear={() => set((prev) => ({ ...prev, releasedAt: "" }))}
          className="font-mono"
        />
      ),
    },
    {
      header: "Released",
      width: "w-24",
      headerTitle: "Whether this set has been officially released for play",
      cell: (s) => (
        <Badge variant={s.released ? "default" : "secondary"}>
          {s.released ? "yes" : "preview"}
        </Badge>
      ),
      editCell: (d, set) => (
        <Switch
          checked={d.released}
          onCheckedChange={(checked) => set((prev) => ({ ...prev, released: checked }))}
        />
      ),
      addCell: (d, set) => (
        <Switch
          checked={d.released}
          onCheckedChange={(checked) => set((prev) => ({ ...prev, released: checked }))}
        />
      ),
    },
    {
      header: "Type",
      width: "w-36",
      cell: (s) => (
        <Badge variant={s.setType === "main" ? "default" : "secondary"}>{s.setType}</Badge>
      ),
      editCell: (d, set) => (
        <Select
          value={d.setType}
          onValueChange={(value) => {
            if (value) {
              set((prev) => ({ ...prev, setType: value as "main" | "supplemental" }));
            }
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">main</SelectItem>
            <SelectItem value="supplemental">supplemental</SelectItem>
          </SelectContent>
        </Select>
      ),
      addCell: (d, set) => (
        <Select
          value={d.setType}
          onValueChange={(value) => {
            if (value) {
              set((prev) => ({ ...prev, setType: value as "main" | "supplemental" }));
            }
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">main</SelectItem>
            <SelectItem value="supplemental">supplemental</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      header: "Cards",
      width: "w-24",
      align: "right",
      headerTitle: "Cards in this set",
      cell: (s) =>
        s.cardCount > 0 ? (
          <Link to="/admin/cards" search={{ set: s.slug }} className="hover:opacity-70">
            <CountBadge count={s.cardCount} />
          </Link>
        ) : (
          <CountBadge count={0} />
        ),
    },
    {
      header: "Printings",
      width: "w-24",
      align: "right",
      headerTitle: "Printings in this set",
      cell: (s) =>
        s.printingCount > 0 ? (
          <Link to="/admin/cards" search={{ set: s.slug }} className="hover:opacity-70">
            <CountBadge count={s.printingCount} />
          </Link>
        ) : (
          <CountBadge count={0} />
        ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={sets}
      getRowKey={(s) => s.id}
      emptyText="No sets yet."
      reorder={{
        onMove: moveSet,
        isPending: reorderMutation.isPending,
      }}
      add={{
        emptyDraft: {
          id: "",
          name: "",
          printedTotal: "",
          releasedAt: "",
          released: true,
          setType: "main" as const,
        },
        onSave: (d) => {
          const printedTotal = parseInt(d.printedTotal, 10);
          return createMutation.mutateAsync({
            id: d.id.trim(),
            name: d.name.trim(),
            printedTotal: isNaN(printedTotal) ? 0 : printedTotal,
            releasedAt: d.releasedAt || null,
          });
        },
        validate: (d) => {
          if (!d.id.trim() || !d.name.trim()) {
            return "ID and name are required";
          }
          const pt = parseInt(d.printedTotal, 10);
          if (d.printedTotal && (isNaN(pt) || pt < 0)) {
            return "Printed total must be a non-negative number";
          }
          return null;
        },
        label: "Add Set",
      }}
      edit={{
        toDraft: (s) => ({
          id: s.id,
          name: s.name,
          printedTotal: s.printedTotal === null ? "" : String(s.printedTotal),
          releasedAt: s.releasedAt ?? "",
          released: s.released,
          setType: s.setType,
        }),
        onSave: (d) => {
          const printedTotal = parseInt(d.printedTotal, 10);
          return updateMutation.mutateAsync({
            id: d.id,
            name: d.name,
            printedTotal: isNaN(printedTotal) ? 0 : printedTotal,
            releasedAt: d.releasedAt || null,
            released: d.released,
            setType: d.setType,
          });
        },
        validate: (d) => {
          const pt = parseInt(d.printedTotal, 10);
          if (isNaN(pt) || pt < 0) {
            return "Printed total must be a non-negative number";
          }
          return null;
        },
      }}
      delete={{
        onDelete: (s) => deleteMutation.mutateAsync(s.id),
        confirm: (s) => ({
          title: `Delete set \u201C${s.slug}\u201D?`,
          description: (
            <>
              This will permanently delete the set <strong>{s.name}</strong>. Sets with printings
              cannot be deleted — remove their printings first.
            </>
          ),
        }),
      }}
    />
  );
}
