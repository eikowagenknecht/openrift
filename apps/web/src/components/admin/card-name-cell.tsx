import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { extractCardIdFromShortCode } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import { ImagePlusIcon, LinkIcon, LoaderIcon } from "lucide-react";

import { AssignButton } from "@/components/admin/assign-button";
import { Button } from "@/components/ui/button";
import type { useAcceptGallery, useLinkCard } from "@/hooks/use-admin-card-mutations";

export interface CardNameCellMeta {
  linkCard: ReturnType<typeof useLinkCard>;
  acceptGallery: ReturnType<typeof useAcceptGallery>;
  allCards: { id: string; slug: string; name: string; type: string }[];
}

export function CardNameCell({
  row,
  meta,
}: {
  row: CandidateCardSummaryResponse;
  meta: CardNameCellMeta;
}) {
  const { linkCard, acceptGallery, allCards } = meta;
  const suggestedCardId =
    !row.cardSlug && row.stagingShortCodes.length > 0
      ? extractCardIdFromShortCode(row.stagingShortCodes[0])
      : null;

  return (
    <>
      <Link
        to={row.cardSlug ? "/admin/cards/$cardSlug" : "/admin/cards/new/$name"}
        params={row.cardSlug ? { cardSlug: row.cardSlug } : { name: row.normalizedName }}
        className="font-medium hover:underline"
      >
        {(row.cardSlug || suggestedCardId) && (
          <span className={row.cardSlug ? "text-muted-foreground" : "text-muted-foreground/40"}>
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
        <AssignButton normalizedName={row.normalizedName} allCards={allCards} linkCard={linkCard} />
      )}
    </>
  );
}
