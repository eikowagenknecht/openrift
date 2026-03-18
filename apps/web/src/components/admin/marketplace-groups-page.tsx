import { useState } from "react";

import { CountBadge } from "@/components/admin/count-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function GroupIdCell({ group }: { group: MarketplaceGroup }) {
  const urlFn = externalUrls[group.marketplace];
  if (urlFn) {
    return (
      <a
        href={urlFn(group.groupId)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        {group.groupId}
      </a>
    );
  }
  return group.groupId;
}

const marketplaceLabels: Record<string, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
};

export function MarketplaceGroupsPage() {
  const { data } = useMarketplaceGroups();
  const { groups } = data;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Marketplace</TableHead>
              <TableHead className="w-24">Group ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Abbreviation</TableHead>
              <TableHead className="w-24 text-right" title="Products mapped to printings">
                Assigned
              </TableHead>
              <TableHead
                className="w-24 text-right"
                title="Distinct products in staging, not yet mapped to printings"
              >
                Staged
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                  No groups yet — they appear after a price scrape runs.
                </TableCell>
              </TableRow>
            )}
            {groups.map((group) => (
              <TableRow key={`${group.marketplace}:${group.groupId}`}>
                <TableCell>
                  <Badge variant="outline">
                    {marketplaceLabels[group.marketplace] ?? group.marketplace}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">
                  <GroupIdCell group={group} />
                </TableCell>
                <TableCell>
                  {group.marketplace === "cardmarket" ? (
                    <EditableName group={group} />
                  ) : (
                    <div className="flex h-8 items-center">{group.name}</div>
                  )}
                </TableCell>
                <TableCell className="font-mono">{group.abbreviation}</TableCell>
                <TableCell className="text-right">
                  <CountBadge count={group.assignedCount} />
                </TableCell>
                <TableCell className="text-right">
                  <CountBadge count={group.stagedCount} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
