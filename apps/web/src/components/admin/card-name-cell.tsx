import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { extractCardIdFromShortCode } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import { ImagePlusIcon, LinkIcon, LoaderIcon } from "lucide-react";

import { AssignButton } from "@/components/admin/assign-button";
import { Button } from "@/components/ui/button";
import type { useAcceptFavoriteNewCard, useLinkCard } from "@/hooks/use-admin-card-mutations";

export interface CardNameCellMeta {
  linkCard: ReturnType<typeof useLinkCard>;
  acceptFavorite: ReturnType<typeof useAcceptFavoriteNewCard>;
  allCards: { id: string; slug: string; name: string; types: string[] }[];
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
  const suggestedCardId =
    !row.cardSlug && row.stagingShortCodes.length > 0
      ? extractCardIdFromShortCode(row.stagingShortCodes[0])
      : null;

  // A name with no letters or digits at all normalizes to "". That is the
  // `$name` path param for the unmatched-card route and the lookup key for
  // link/accept, so with an empty value every one of those affordances is a
  // dead end. Render the row as plain text instead — the reviewer can still
  // see it and fix the name at the source.
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
