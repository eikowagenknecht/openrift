import { formatSourceIds } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import { CheckCheckIcon, LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAutoCheckSources, useCardSourceList, useLinkCard } from "@/hooks/use-card-sources";

type Filter = "unchecked" | "unmatched" | "matched" | null;

export function CardSourcesListPage() {
  const [filter, setFilter] = useState<Filter>(null);
  const { data } = useCardSourceList();
  const autoCheck = useAutoCheckSources();
  const linkCard = useLinkCard();

  const counts = {
    unchecked: data.filter((r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0).length,
    unmatched: data.filter((r) => !r.cardSlug).length,
    matched: data.filter((r) => r.cardSlug).length,
  };

  const rows = data.filter((row) => {
    if (filter === "unchecked") {
      return row.uncheckedCardCount + row.uncheckedPrintingCount > 0;
    }
    if (filter === "unmatched") {
      return !row.cardSlug;
    }
    if (filter === "matched") {
      return Boolean(row.cardSlug);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={autoCheck.isPending}
          onClick={() =>
            autoCheck.mutate(undefined, {
              onSuccess: (result) => {
                const total = result.cardSourcesChecked + result.printingSourcesChecked;
                toast(
                  total > 0
                    ? `Auto-checked ${result.cardSourcesChecked} card + ${result.printingSourcesChecked} printing sources`
                    : "No matching unchecked sources found",
                );
              },
            })
          }
        >
          <CheckCheckIcon />
          {autoCheck.isPending ? "Checking..." : "Auto-check matching"}
        </Button>

        {(
          [
            ["unchecked", "Review", counts.unchecked],
            ["unmatched", "New", counts.unmatched],
            ["matched", "Active", counts.matched],
          ] as const
        ).map(([f, label, count]) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(filter === f ? null : f)}
          >
            {label} ({count})
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No card sources found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Printings</TableHead>
              <TableHead className="w-28">Card Sources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const total = row.uncheckedCardCount + row.uncheckedPrintingCount;
              const suggestedCardId =
                !row.cardSlug && row.stagingSourceIds.length > 0
                  ? row.stagingSourceIds[0].replace(/(?<=\d)[a-z*]+$/, "")
                  : null;
              return (
                <TableRow key={row.cardSlug ?? row.name}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {row.cardSlug ? (
                        <Badge variant="outline">Active</Badge>
                      ) : row.suggestedCardSlug ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          disabled={linkCard.isPending}
                          onClick={() => {
                            const slug = row.suggestedCardSlug;
                            if (slug) {
                              linkCard.mutate({
                                name: row.normalizedName,
                                cardId: slug,
                              });
                            }
                          }}
                        >
                          <LinkIcon className="mr-1 size-3" />
                          {row.suggestedCardSlug}
                        </Button>
                      ) : (
                        <Badge variant="secondary">New</Badge>
                      )}
                      {total > 0 && <Badge variant="destructive">Review</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={row.cardSlug ? "/admin/cards/$cardSlug" : "/admin/cards/new/$name"}
                      params={
                        row.cardSlug ? { cardSlug: row.cardSlug } : { name: row.normalizedName }
                      }
                      className="font-medium hover:underline"
                    >
                      {(row.cardSlug || suggestedCardId) && (
                        <span
                          className={
                            row.cardSlug ? "text-muted-foreground" : "text-muted-foreground/40"
                          }
                        >
                          {row.cardSlug ?? suggestedCardId}
                        </span>
                      )}{" "}
                      {row.name}
                    </Link>
                    {row.hasGallery && <Badge className="ml-2 text-xs">gallery</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span>
                      {row.sourceIds.length > 0 && (
                        <>
                          {formatSourceIds(row.sourceIds)
                            .split(", ")
                            .map((id, i, arr) => (
                              <span key={id} className="text-muted-foreground">
                                {id}
                                {(i < arr.length - 1 || row.stagingSourceIds.length > 0) && ", "}
                              </span>
                            ))}
                        </>
                      )}
                      {row.stagingSourceIds.length > 0 && (
                        <>
                          {formatSourceIds(row.stagingSourceIds)
                            .split(", ")
                            .map((id, i, arr) => (
                              <span key={`s-${id}`} className="italic text-muted-foreground/50">
                                {id}
                                {i < arr.length - 1 && ", "}
                              </span>
                            ))}
                        </>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.sourceCount}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
