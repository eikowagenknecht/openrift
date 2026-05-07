import type { MarketplaceGroupKind } from "@openrift/shared";
import { useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { CountBadge } from "@/components/admin/count-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketplaceGroup } from "@/hooks/use-marketplace-groups";
import { useMarketplaceGroups, useUpdateMarketplaceGroup } from "@/hooks/use-marketplace-groups";
import { useSets } from "@/hooks/use-sets";

const groupKindItems: { value: MarketplaceGroupKind; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "special", label: "Special" },
];

const NO_SET_VALUE = "__none__";

interface SetItem {
  value: string;
  label: string;
}

function SetSelect({ group, items }: { group: MarketplaceGroup; items: SetItem[] }) {
  const mutation = useUpdateMarketplaceGroup();
  const current = group.setId ?? NO_SET_VALUE;

  function commit(next: string | null) {
    if (next === null) {
      return;
    }
    const newSetId = next === NO_SET_VALUE ? null : next;
    if (newSetId === group.setId) {
      return;
    }
    mutation.mutate({
      marketplace: group.marketplace,
      groupId: group.groupId,
      setId: newSetId,
    });
  }

  return (
    <Select items={items} value={current} onValueChange={commit}>
      <SelectTrigger className="h-8 w-40" aria-label="Assigned set">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function KindSelect({ group }: { group: MarketplaceGroup }) {
  const mutation = useUpdateMarketplaceGroup();

  function commit(next: string | null) {
    if (next === null || next === group.groupKind) {
      return;
    }
    mutation.mutate({
      marketplace: group.marketplace,
      groupId: group.groupId,
      groupKind: next as MarketplaceGroupKind,
    });
  }

  return (
    <Select items={groupKindItems} value={group.groupKind} onValueChange={commit}>
      <SelectTrigger className="h-8 w-28" aria-label="Group kind">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {groupKindItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function EditableName({ group }: { group: MarketplaceGroup }) {
  const mutation = useUpdateMarketplaceGroup();
  const [value, setValue] = useState(group.name ?? "");

  function commit() {
    const trimmed = value.trim();
    const newName = trimmed === "" ? null : trimmed;
    if (newName !== group.name) {
      mutation.mutate({ marketplace: group.marketplace, groupId: group.groupId, name: newName });
    }
  }

  return (
    <Input
      className="h-8"
      placeholder="Unnamed"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const externalUrls: Record<string, (id: number) => string> = {
  cardmarket: (id) => `https://www.cardmarket.com/en/Riftbound/Products/Singles?idExpansion=${id}`,
};

const marketplaceLabels: Record<string, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
};

function buildColumns(
  setItems: SetItem[],
  setLabelById: Map<string, string>,
): AdminColumnDef<MarketplaceGroup>[] {
  return [
    {
      header: "Marketplace",
      width: "w-28",
      sortValue: (g) => g.marketplace,
      cell: (g) => (
        <Badge variant="outline">{marketplaceLabels[g.marketplace] ?? g.marketplace}</Badge>
      ),
    },
    {
      header: "Group ID",
      width: "w-24",
      sortValue: (g) => g.groupId,
      cell: (g) => {
        const urlFn = externalUrls[g.marketplace];
        if (urlFn) {
          return (
            <a
              href={urlFn(g.groupId)}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:text-primary/80 font-mono underline underline-offset-4"
            >
              {g.groupId}
            </a>
          );
        }
        return <span className="font-mono">{g.groupId}</span>;
      },
    },
    {
      header: "Name",
      sortValue: (g) => g.name,
      cell: (g) =>
        g.marketplace === "cardmarket" ? (
          <EditableName group={g} />
        ) : (
          <div className="flex h-8 items-center">{g.name}</div>
        ),
    },
    {
      header: "Abbreviation",
      width: "w-28",
      cell: (g) => <span className="font-mono">{g.abbreviation}</span>,
    },
    {
      header: "Kind",
      width: "w-32",
      headerTitle: "Basic = set/supplemental printings. Special = promo/special printings.",
      sortValue: (g) => g.groupKind,
      cell: (g) => <KindSelect group={g} />,
    },
    {
      header: "Set",
      width: "w-44",
      headerTitle:
        "Scope auto-suggestions to printings of this set. Leave unset to suggest from any set.",
      sortValue: (g) => (g.setId ? (setLabelById.get(g.setId) ?? "") : ""),
      cell: (g) => <SetSelect group={g} items={setItems} />,
    },
    {
      header: "Assigned",
      width: "w-24",
      align: "right",
      headerTitle: "Products mapped to printings",
      sortValue: (g) => g.assignedCount,
      cell: (g) => <CountBadge count={g.assignedCount} />,
    },
    {
      header: "Staged",
      width: "w-24",
      align: "right",
      headerTitle: "Distinct products in staging, not yet mapped to printings",
      sortValue: (g) => g.stagedCount,
      cell: (g) => <CountBadge count={g.stagedCount} />,
    },
  ];
}

export function MarketplaceGroupsPage() {
  const { data } = useMarketplaceGroups();
  const { data: setsData } = useSets();
  const { groups } = data;

  const sortedSets = setsData.sets.toSorted((a, b) => a.sortOrder - b.sortOrder);
  const setItems: SetItem[] = [
    { value: NO_SET_VALUE, label: "None" },
    ...sortedSets.map((s) => ({ value: s.id, label: s.name })),
  ];
  const setLabelById = new Map(sortedSets.map((s) => [s.id, s.name]));
  const columns = buildColumns(setItems, setLabelById);

  return (
    <AdminTable
      columns={columns}
      data={groups}
      getRowKey={(g) => `${g.marketplace}:${g.groupId}`}
      emptyText="No groups yet. They appear after a price scrape runs."
    />
  );
}
