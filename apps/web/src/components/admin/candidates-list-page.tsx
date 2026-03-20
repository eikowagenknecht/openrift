import { formatShortCodes } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import { CheckCheckIcon, ImagePlusIcon, LinkIcon, LoaderIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
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
import {
  useAcceptGallery,
  useAllCards,
  useAutoCheckCandidates,
  useCandidateList,
  useLinkCard,
} from "@/hooks/use-candidates";

type Filter = "unchecked" | "unmatched" | "matched" | null;

function AssignButton({
  normalizedName,
  allCards,
  linkCard,
}: {
  normalizedName: string;
  allCards: { slug: string; name: string; type: string }[];
  linkCard: ReturnType<typeof useLinkCard>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const results: CardSearchResult[] =
    search.length >= 2
      ? allCards
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 20)
          .map((c) => ({ id: c.slug, label: c.name, sublabel: c.slug, detail: c.type }))
      : [];

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="ml-2 h-5 text-xs"
        onClick={() => setOpen(true)}
      >
        <LinkIcon className="size-3" />
        Assign
      </Button>
    );
  }

  return (
    <>
      <CardSearchDropdown
        results={results}
        onSearch={setSearch}
        onSelect={(cardId) => {
          linkCard.mutate({ name: normalizedName, cardId });
          setOpen(false);
          setSearch("");
        }}
        placeholder="Search by name…"
        className="ml-2 inline-flex w-48 [&_input]:h-5 [&_input]:py-0 [&_input]:text-xs"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
        autoFocus
      />
      <Button
        variant="ghost"
        size="sm"
        className="ml-1 h-5 text-xs"
        onClick={() => {
          setOpen(false);
          setSearch("");
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </>
  );
}

export function CandidatesListPage() {
  const [filter, setFilter] = useState<Filter>(null);
  const { data } = useCandidateList();
  const autoCheck = useAutoCheckCandidates();
  const linkCard = useLinkCard();
  const acceptGallery = useAcceptGallery();
  const { data: allCards } = useAllCards();

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
                const total = result.candidateCardsChecked + result.candidatePrintingsChecked;
                toast(
                  total > 0
                    ? `Auto-checked ${result.candidateCardsChecked} candidate card + ${result.candidatePrintingsChecked} candidate printing sources`
                    : "No matching unchecked candidates found",
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
        <p className="py-8 text-center text-sm text-muted-foreground">No candidates found.</p>
      ) : (
        <div className="[&>[data-slot=table-container]]:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Printings</TableHead>
                <TableHead className="w-28">Candidates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const total = row.uncheckedCardCount + row.uncheckedPrintingCount;
                const suggestedCardId =
                  !row.cardSlug && row.stagingShortCodes.length > 0
                    ? row.stagingShortCodes[0].replace(/(?<=\d)[a-z*]+$/, "")
                    : null;
                return (
                  <TableRow key={row.cardSlug ?? row.name}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {row.cardSlug ? (
                          <Badge variant="outline">Active</Badge>
                        ) : (
                          <Badge variant="secondary">New</Badge>
                        )}
                        {row.hasGallery && <Badge className="text-xs">gallery</Badge>}
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
                      {!row.cardSlug && row.suggestedCardSlug && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2 h-5 text-xs"
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
                          <LinkIcon className="size-3" />
                          {row.suggestedCardSlug}
                        </Button>
                      )}
                      {!row.cardSlug && row.hasGallery && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2 h-5 text-xs"
                          disabled={acceptGallery.isPending}
                          onClick={() => acceptGallery.mutate(row.normalizedName)}
                        >
                          {acceptGallery.isPending ? (
                            <LoaderIcon className="size-3 animate-spin" />
                          ) : (
                            <ImagePlusIcon className="size-3" />
                          )}
                          Accept gallery
                        </Button>
                      )}
                      {!row.cardSlug && allCards && (
                        <AssignButton
                          normalizedName={row.normalizedName}
                          allCards={allCards}
                          linkCard={linkCard}
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span>
                        {row.shortCodes.length > 0 && (
                          <>
                            {formatShortCodes(row.shortCodes)
                              .split(", ")
                              .map((id, i, arr) => (
                                <span key={id} className="text-muted-foreground">
                                  {id}
                                  {(i < arr.length - 1 || row.stagingShortCodes.length > 0) && ", "}
                                </span>
                              ))}
                          </>
                        )}
                        {row.stagingShortCodes.length > 0 && (
                          <>
                            {formatShortCodes(row.stagingShortCodes)
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
                      <Badge variant="secondary">{row.candidateCount}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
