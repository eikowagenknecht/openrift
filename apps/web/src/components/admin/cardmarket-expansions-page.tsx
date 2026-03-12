import { useState } from "react";

import { CountBadge } from "@/components/admin/count-badge";
import {
  ActionCard,
  ClearPriceCard,
  clearActions,
  refreshActions,
  useCronStatus,
} from "@/components/admin/refresh-actions";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCardmarketExpansions,
  useUpdateCardmarketExpansion,
} from "@/hooks/use-cardmarket-expansions";

import { AdminQueryShell } from "./admin-query-shell";

function EditableName({
  expansionId,
  initialName,
}: {
  expansionId: number;
  initialName: string | null;
}) {
  const mutation = useUpdateCardmarketExpansion();
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

export function CardmarketExpansionsPage() {
  const query = useCardmarketExpansions();
  const { data: cronStatus } = useCronStatus();

  return (
    <AdminQueryShell query={query}>
      {({ expansions }) => (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            <ActionCard action={refreshActions.cardmarket} cronStatus={cronStatus} />
            <ClearPriceCard action={clearActions.cardmarket} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Expansion ID</TableHead>
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
                      No expansions yet — they appear after a Cardmarket price scrape runs.
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
