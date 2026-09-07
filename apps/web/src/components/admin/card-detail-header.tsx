import type { AdminCardResponse } from "@openrift/shared/types/api/admin";
import { Link } from "@tanstack/react-router";
import {
  BanIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FileWarningIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useDeleteCard, useRenameCard } from "@/hooks/use-admin-card-mutations";
import type { PrevNextSlugs } from "@/lib/admin-card-nav";

interface CardDetailHeaderProps {
  card: AdminCardResponse;
  cardId: string;
  expectedCardId: string;
  sourceCount: number;
  hasUnchecked: boolean;
  prevNextCards: PrevNextSlugs;
  isCheckingAll: boolean;
  onCheckAllAndNext: () => void;
  goToCard: (cardSlug: string) => void;
  goToList: () => void;
  onAddBan: () => void;
  onAddErrata: () => void;
  isAdmin: boolean;
}

export function CardDetailHeader({
  card,
  cardId,
  expectedCardId,
  sourceCount,
  hasUnchecked,
  prevNextCards,
  isCheckingAll,
  onCheckAllAndNext,
  goToCard,
  goToList,
  onAddBan,
  onAddErrata,
  isAdmin,
}: CardDetailHeaderProps) {
  const renameCard = useRenameCard();
  const deleteCardMutation = useDeleteCard();
  const canonicalName = card.name;
  const isCardIdStale = cardId !== expectedCardId;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={!prevNextCards.prev}
            onClick={() => {
              if (prevNextCards.prev) {
                goToCard(prevNextCards.prev);
              }
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!prevNextCards.next}
            onClick={() => {
              if (prevNextCards.next) {
                goToCard(prevNextCards.next);
              }
            }}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <Heading level={2}>{canonicalName}</Heading>
        {isAdmin && (
          <Button
            variant={hasUnchecked ? "default" : "outline"}
            className="gap-1.5"
            disabled={isCheckingAll}
            onClick={onCheckAllAndNext}
          >
            {isCheckingAll ? <LoaderIcon className="animate-spin" /> : <CheckCheckIcon />}
            {isCheckingAll ? "Checking…" : "Check all & next"}
            <Kbd className="bg-background/20 pointer-events-none ml-1 leading-none text-inherit opacity-60">
              Ctrl ⇧ ↵
            </Kbd>
          </Button>
        )}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={
                  <Link
                    to="/admin/cards/$cardSlug/printings/create"
                    params={{ cardSlug: cardId }}
                  />
                }
              >
                <PlusIcon className="mr-2" />
                Create printing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddBan}>
                <BanIcon className="mr-2" />
                Add ban
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddErrata}>
                <FileWarningIcon className="mr-2" />
                {card.errata ? "Edit errata" : "Add errata"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={deleteCardMutation.isPending}
                onClick={() => {
                  if (
                    globalThis.confirm(
                      `Delete card "${canonicalName}" and all its printings? This cannot be undone.`,
                    )
                  ) {
                    deleteCardMutation.mutate(card.id, { onSuccess: goToList });
                  }
                }}
              >
                <Trash2Icon className="text-destructive mr-2" />
                <span className="text-destructive">Delete card</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <span className={isCardIdStale ? "text-warning line-through" : ""}>{cardId}</span>
        {isCardIdStale && (
          <>
            <span>&rarr; {expectedCardId}</span>
            {isAdmin && (
              <Button
                variant="ghost"
                disabled={renameCard.isPending}
                onClick={() =>
                  renameCard.mutate(
                    { cardId: card.id, newId: expectedCardId },
                    { onSuccess: () => goToCard(expectedCardId) },
                  )
                }
              >
                <RefreshCwIcon className="mr-1" />
                Regenerate
              </Button>
            )}
          </>
        )}
        <span>
          ({sourceCount} source{sourceCount === 1 ? "" : "s"})
        </span>
      </p>
    </div>
  );
}
