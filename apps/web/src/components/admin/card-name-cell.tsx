import type { CandidateCardSummaryResponse } from "@openrift/shared/types/api/admin";
import { extractCardIdFromShortCode } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import { ImagePlusIcon, LinkIcon, LoaderIcon } from "lucide-react";

import { AssignButton } from "@/components/admin/assign-button";
import { Button } from "@/components/ui/button";
import type { useAcceptFavoriteNewCard, useLinkCard } from "@/hooks/use-admin-card-mutations";
import type { AdminSearchableCard } from "@/hooks/use-card-search";

export interface CardNameCellMeta {
  linkCard: ReturnType<typeof useLinkCard>;
  acceptFavorite: ReturnType<typeof useAcceptFavoriteNewCard>;
  allCards: AdminSearchableCard[];
  /** Full admin — card-review grant holders only get the name link (their accept flow lives on the detail pages). */
  isAdmin: boolean;
}

export function CardNameCell({
  row,
  meta,
}: {
  row: CandidateCardSummaryResponse;
  meta: CardNameCellMeta;
}) {
  const { linkCard, acceptFavorite, allCards, isAdmin } = meta;
  const firstShortCode = row.stagingShortCodes.at(0);
  const suggestedCardId =
    !row.cardSlug && firstShortCode !== undefined
      ? extractCardIdFromShortCode(firstShortCode)
      : null;

  // A name with no letters or digits at all normalizes to "", the lookup key
  // for the unmatched-card route and for link/accept: render as plain text.
  const hasLookupKey = row.normalizedName !== "";
  const linkable = Boolean(row.cardSlug) || hasLookupKey;

  const label = (
    <>
      {(row.cardSlug || suggestedCardId) && (
        <span className={row.cardSlug ? "text-muted-foreground" : "text-muted-foreground/40"}>
          {row.cardSlug ?? suggestedCardId}
        </span>
      )}{" "}
      {row.name}
    </>
  );

  return (
    <>
      {linkable ? (
        <Link
          to={row.cardSlug ? "/admin/cards/$cardSlug" : "/admin/cards/new/$name"}
          params={row.cardSlug ? { cardSlug: row.cardSlug } : { name: row.normalizedName }}
          className="font-medium hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="font-medium">{label}</span>
      )}
      {isAdmin && !row.cardSlug && hasLookupKey && row.suggestedCardSlug && (
        <Button
          variant="outline"
          className="ml-2"
          disabled={linkCard.isPending}
          onClick={() => {
            const match = allCards.find((c) => c.slug === row.suggestedCardSlug);
            if (match) {
              linkCard.mutate({ name: row.normalizedName, cardId: match.id });
            }
          }}
        >
          <LinkIcon className="size-3" />
          {row.suggestedCardSlug}
        </Button>
      )}
      {isAdmin && !row.cardSlug && hasLookupKey && row.hasFavorite && (
        <Button
          variant="outline"
          className="ml-2"
          disabled={acceptFavorite.isPending}
          onClick={() => acceptFavorite.mutate(row.normalizedName)}
        >
          {acceptFavorite.isPending ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <ImagePlusIcon className="size-3" />
          )}
          Accept
        </Button>
      )}
      {isAdmin && !row.cardSlug && hasLookupKey && allCards && (
        <AssignButton normalizedName={row.normalizedName} allCards={allCards} linkCard={linkCard} />
      )}
    </>
  );
}
