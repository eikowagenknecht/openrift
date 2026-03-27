import { useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { CountBadge } from "@/components/admin/count-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { MarketplaceGroup } from "@/hooks/use-marketplace-groups";
import { useMarketplaceGroups, useUpdateMarketplaceGroup } from "@/hooks/use-marketplace-groups";

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

const columns: AdminColumnDef<MarketplaceGroup>[] = [
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

export function MarketplaceGroupsPage() {
  const { data } = useMarketplaceGroups();
  const { groups } = data;

  return (
    <AdminTable
      columns={columns}
      data={groups}
      getRowKey={(g) => `${g.marketplace}:${g.groupId}`}
      emptyText="No groups yet — they appear after a price scrape runs."
    />
  );
}
