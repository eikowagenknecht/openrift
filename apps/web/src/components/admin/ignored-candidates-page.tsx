import { Undo2Icon } from "lucide-react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useIgnoredCandidates,
  useUnignoreCandidateCard,
  useUnignoreCandidatePrinting,
} from "@/hooks/use-ignored-candidates";

interface IgnoredCard {
  id: string;
  provider: string;
  externalId: string;
  createdAt: string;
}

interface IgnoredPrinting {
  id: string;
  provider: string;
  externalId: string;
  finish: string | null;
  createdAt: string;
}

export function IgnoredCandidatesPage() {
  const { data } = useIgnoredCandidates();
  const unignoreCard = useUnignoreCandidateCard();
  const unignorePrinting = useUnignoreCandidatePrinting();
  const { cards, printings } = data;

  const cardColumns: AdminColumnDef<IgnoredCard>[] = [
    {
      header: "Provider",
      width: "w-36",
      sortValue: (r) => r.provider,
      cell: (r) => <Badge variant="outline">{r.provider}</Badge>,
    },
    {
      header: "External ID",
      sortValue: (r) => r.externalId,
      cell: (r) => <span className="font-mono">{r.externalId}</span>,
    },
    {
      header: "Ignored At",
      width: "w-36",
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="text-muted-foreground">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
      ),
    },
  ];

  const printingColumns: AdminColumnDef<IgnoredPrinting>[] = [
    {
      header: "Provider",
      width: "w-36",
      sortValue: (r) => r.provider,
      cell: (r) => <Badge variant="outline">{r.provider}</Badge>,
    },
    {
      header: "External ID",
      sortValue: (r) => r.externalId,
      cell: (r) => <span className="font-mono">{r.externalId}</span>,
    },
    {
      header: "Finish",
      width: "w-24",
      sortValue: (r) => r.finish,
      cell: (r) =>
        r.finish ? (
          <Badge variant="outline">{r.finish}</Badge>
        ) : (
          <Badge variant="outline">all</Badge>
        ),
    },
    {
      header: "Ignored At",
      width: "w-36",
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="text-muted-foreground">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ignored Candidate Cards</h2>
        <AdminTable
          columns={cardColumns}
          data={cards}
          getRowKey={(r) => r.id}
          emptyText="No ignored candidate cards."
          defaultSort={{ column: "Ignored At", direction: "desc" }}
          actions={(r) => (
            <Button
              variant="ghost"
              onClick={() =>
                unignoreCard.mutate({ provider: r.provider, externalId: r.externalId })
              }
              disabled={unignoreCard.isPending}
            >
              <Undo2Icon className="size-3.5" />
              Unignore
            </Button>
          )}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ignored Candidate Printings</h2>
        <AdminTable
          columns={printingColumns}
          data={printings}
          getRowKey={(r) => r.id}
          emptyText="No ignored candidate printings."
          defaultSort={{ column: "Ignored At", direction: "desc" }}
          actions={(r) => (
            <Button
              variant="ghost"
              onClick={() =>
                unignorePrinting.mutate({
                  provider: r.provider,
                  externalId: r.externalId,
                  finish: r.finish ?? null,
                })
              }
              disabled={unignorePrinting.isPending}
            >
              <Undo2Icon className="size-3.5" />
              Unignore
            </Button>
          )}
        />
      </section>
    </div>
  );
}
