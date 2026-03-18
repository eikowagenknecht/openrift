import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CheckCheckIcon, LinkIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAutoCheckSources,
  useCardSourceList,
  useLinkCard,
  useSourceNames,
} from "@/hooks/use-card-sources";

type Filter = "all" | "unchecked" | "unmatched" | "active";

function formatSourceIds(ids: string[]): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => (n > 1 ? `${id} ×${n}` : id))
    .join(", ");
}

export function CardSourcesListPage() {
  const { set: setSlug } = useSearch({ from: "/_authenticated/admin/cards" });
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState<string>();
  const { data: sourceNames } = useSourceNames();
  const { data } = useCardSourceList(filter, source, setSlug);
  const linkCard = useLinkCard();
  const autoCheck = useAutoCheckSources();

  const rows = data;

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

        <Select
          value={source ?? ""}
          onValueChange={(v) => setSource(!v || v === "__all__" ? undefined : v)}
        >
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            {sourceNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {setSlug && (
          <Badge variant="secondary" className="flex h-8 items-center gap-1">
            Set: {setSlug}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ to: "/admin/cards", search: {} })}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        )}

        {(["all", "active", "unchecked", "unmatched"] as const).map((f) => {
          const label =
            f === "all"
              ? "All"
              : f === "active"
                ? "Active only"
                : f === "unchecked"
                  ? "Needs review"
                  : "Candidates only";
          return (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No card sources found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Card Name</TableHead>
              <TableHead>Printing IDs</TableHead>
              <TableHead className="w-28">Sources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const total = row.uncheckedCardCount + row.uncheckedPrintingCount;
              const suggestedCardId =
                !row.cardSlug && row.pendingSourceIds.length > 0
                  ? row.pendingSourceIds[0].replace(/(?<=\d)[a-z*]+$/, "")
                  : null;
              return (
                <TableRow key={row.cardSlug ?? row.name}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {row.cardId ? (
                        <Badge variant="outline">Active</Badge>
                      ) : row.suggestedCard ? (
                        <SuggestedMatch
                          cardName={row.suggestedCard.name}
                          isPending={linkCard.isPending}
                          onLink={() =>
                            linkCard.mutate({
                              name: row.normalizedName,
                              cardId: row.suggestedCard?.slug ?? "",
                            })
                          }
                        />
                      ) : (
                        <Badge variant="secondary">Candidate</Badge>
                      )}
                      {total > 0 && <Badge variant="destructive">Unchecked</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={row.cardId ? "/admin/cards/$cardId" : "/admin/cards/new/$name"}
                      params={
                        row.cardSlug ? { cardId: row.cardSlug } : { name: row.normalizedName }
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
                    {row.hasMissingImage && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        missing image
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span>
                      {row.sourceIds.length > 0 &&
                        formatSourceIds(row.sourceIds)
                          .split(", ")
                          .map((id, i, arr) => (
                            <span key={id} className="text-muted-foreground">
                              {id}
                              {(i < arr.length - 1 ||
                                row.pendingSourceIds.length > 0 ||
                                row.candidateSourceIds.length > 0) &&
                                ", "}
                            </span>
                          ))}
                      {row.pendingSourceIds.map((id, i) => (
                        <span key={`p-${id}`} className="italic text-muted-foreground/50">
                          {id}
                          {(i < row.pendingSourceIds.length - 1 ||
                            row.candidateSourceIds.length > 0) &&
                            ", "}
                        </span>
                      ))}
                      {row.candidateSourceIds.map((id, i) => (
                        <span key={`c-${id}`} className="italic text-muted-foreground/50">
                          {id}
                          {i < row.candidateSourceIds.length - 1 && ", "}
                        </span>
                      ))}
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

function SuggestedMatch({
  cardName,
  isPending,
  onLink,
}: {
  cardName: string;
  isPending: boolean;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Badge variant="secondary" className="truncate">
        {cardName}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="h-6 shrink-0 text-xs"
        disabled={isPending}
        onClick={onLink}
      >
        <LinkIcon className="mr-1 size-3" />
        Link
      </Button>
    </div>
  );
}
