import { useState } from "react";

import { CountBadge } from "@/components/admin/count-badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCardmarketGroups, useUpdateCardmarketGroup } from "@/hooks/use-cardmarket-groups";

import { AdminQueryShell } from "./admin-query-shell";

function EditableName({
  expansionId,
  initialName,
}: {
  expansionId: number;
  initialName: string | null;
}) {
  const mutation = useUpdateCardmarketGroup();
  const [value, setValue] = useState(initialName ?? "");

  function commit() {
    const trimmed = value.trim();
    const newName = trimmed === "" ? null : trimmed;
    if (newName !== initialName) {
      mutation.mutate({ expansionId, name: newName });
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

export function CardmarketGroupsPage() {
  const query = useCardmarketGroups();

  return (
    <AdminQueryShell query={query}>
      {({ expansions }) => (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Group ID</TableHead>
                  <TableHead className="w-64">Name</TableHead>
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
                {expansions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                      No groups yet — they appear after a Cardmarket price scrape runs.
                    </TableCell>
                  </TableRow>
                )}
                {expansions.map((expansion) => (
                  <TableRow key={expansion.expansionId}>
                    <TableCell className="font-mono">
                      <a
                        href={`https://www.cardmarket.com/en/Riftbound/Products/Singles?idExpansion=${expansion.expansionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        {expansion.expansionId}
                      </a>
                    </TableCell>
                    <TableCell>
                      <EditableName
                        expansionId={expansion.expansionId}
                        initialName={expansion.name}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <CountBadge count={expansion.assignedCount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CountBadge count={expansion.stagedCount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AdminQueryShell>
  );
}
