import type { AdminSetResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
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

function IdCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono">{row.slug}</span>;
}

function NameCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return row.name;
}

function PrintedTotalCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return row.printedTotal;
}

function ReleasedAtCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground font-mono">{row.releasedAt ?? "—"}</span>;
}

function ReleasedCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return (
    <Badge variant={row.released ? "default" : "secondary"}>
      {row.released ? "yes" : "preview"}
    </Badge>
  );
}

function SetTypeCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return (
    <Badge variant={row.setType === WellKnown.setType.MAIN ? "default" : "secondary"}>
      {row.setType}
    </Badge>
  );
}

function CardsCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  if (row.cardCount === 0) {
    return <CountBadge count={0} />;
  }
  return (
    <Link to="/admin/cards" search={{ set: row.slug }} className="hover:opacity-70">
      <CountBadge count={row.cardCount} />
    </Link>
  );
}

function PrintingsCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  if (row.printingCount === 0) {
    return <CountBadge count={0} />;
  }
  return (
    <Link to="/admin/cards" search={{ set: row.slug }} className="hover:opacity-70">
      <CountBadge count={row.printingCount} />
    </Link>
  );
}

function IdInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.id}
      onChange={(e) => setDraft((prev) => ({ ...prev, id: e.target.value }))}
      placeholder="ID"
      className="font-mono"
    />
  );
}

function NameInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
    />
  );
}

function NameAddInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
      placeholder="Name"
    />
  );
}

function PrintedTotalInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      inputMode="numeric"
      value={draft.printedTotal}
      onChange={(e) => setDraft((prev) => ({ ...prev, printedTotal: e.target.value }))}
      className="ml-auto text-right"
    />
  );
}

function PrintedTotalAddInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      inputMode="numeric"
      value={draft.printedTotal}
      onChange={(e) => setDraft((prev) => ({ ...prev, printedTotal: e.target.value }))}
      placeholder="0"
      className="ml-auto text-right"
    />
  );
}

function ReleasedAtPicker({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <DatePicker
      value={draft.releasedAt || null}
      onChange={(iso) => setDraft((prev) => ({ ...prev, releasedAt: iso }))}
      onClear={() => setDraft((prev) => ({ ...prev, releasedAt: "" }))}
      className="font-mono"
    />
  );
}

function ReleasedSwitch({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Switch
      checked={draft.released}
      onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, released: checked }))}
    />
  );
}

function SetTypeSelect({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Select
      value={draft.setType}
      onValueChange={(value) => {
        if (value) {
          setDraft((prev) => ({ ...prev, setType: value as "main" | "supplemental" }));
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
  );
}

function DeleteSetDescription({ name }: { name: string }) {
  return (
    <>
      This will permanently delete the set <strong>{name}</strong>. Sets with printings cannot be
      deleted. Remove their printings first.
    </>
  );
}

const columns: AdminColumnDef<AdminSetResponse, SetDraft>[] = [
  {
    header: "ID",
    width: "w-28",
    cell: <IdCell />,
    addCell: <IdInput />,
  },
  {
    header: "Name",
    cell: <NameCell />,
    editCell: <NameInput />,
    addCell: <NameAddInput />,
  },
  {
    header: "Printed Total",
    width: "w-32",
    align: "right",
    cell: <PrintedTotalCell />,
    editCell: <PrintedTotalInput />,
    addCell: <PrintedTotalAddInput />,
  },
  {
    header: "Release Date",
    width: "w-36",
    cell: <ReleasedAtCell />,
    editCell: <ReleasedAtPicker />,
    addCell: <ReleasedAtPicker />,
  },
  {
    header: "Released",
    width: "w-24",
    headerTitle: "Whether this set has been officially released for play",
    cell: <ReleasedCell />,
    editCell: <ReleasedSwitch />,
    addCell: <ReleasedSwitch />,
  },
  {
    header: "Type",
    width: "w-36",
    cell: <SetTypeCell />,
    editCell: <SetTypeSelect />,
    addCell: <SetTypeSelect />,
  },
  {
    header: "Cards",
    width: "w-24",
    align: "right",
    headerTitle: "Cards in this set",
    cell: <CardsCell />,
  },
  {
    header: "Printings",
    width: "w-24",
    align: "right",
    headerTitle: "Printings in this set",
    cell: <PrintingsCell />,
  },
];

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

  return (
    <AdminTable
      columns={columns}
      data={sets}
      getRowKey={(s) => s.id}
      emptyText="No sets yet."
      title="Sets"
      toolbar={
        <p className="text-muted-foreground text-sm">
          Set order controls which printing a card defaults to wherever no specific printing is
          pinned (general display, and name-based deck imports). The default is the first printing
          by language, then by set order, so moving a set higher makes its printings win.
        </p>
      }
      reorder={{
        onMove: moveSet,
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "sets.json",
        transform: (rows) =>
          rows.map(
            ({ id: _id, cardCount: _cardCount, printingCount: _printingCount, ...rest }) => rest,
          ),
      }}
      add={{
        emptyDraft: {
          id: "",
          name: "",
          printedTotal: "",
          releasedAt: "",
          released: true,
          setType: WellKnown.setType.MAIN,
        },
        onSave: (d) => {
          // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
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
          // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
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
          // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
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
          // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
          const pt = parseInt(d.printedTotal, 10);
          if (isNaN(pt) || pt < 0) {
            return "Printed total must be a non-negative number";
          }
          return null;
        },
      }}
      delete={{
        onDelete: (s) => deleteMutation.mutateAsync(s.id),
        // oxlint-disable-next-line react/no-unstable-nested-components -- callback returns a {title, description} record; JSX in description is via a hoisted DeleteSetDescription, not an inline component
        confirm: (s) => ({
          title: `Delete set “${s.slug}”?`,
          description: <DeleteSetDescription name={s.name} />,
        }),
      }}
    />
  );
}
