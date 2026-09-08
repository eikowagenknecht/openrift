import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { useCards } from "@/features/cards/hooks/use-cards";
import { useCatalogCardSearch } from "@/features/cards/hooks/use-catalog-card-search";

/** Split out so the catalog is only read once the dialog is open. */
function CardSearchBody({ onPick }: { onPick: (cardSlug: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useCatalogCardSearch(query);
  const { cardsById } = useCards();

  return (
    <CardSearchDropdown
      results={results}
      onSearch={setQuery}
      onSelect={(cardId) => {
        const slug = cardsById[cardId]?.slug;
        if (slug) {
          onPick(slug);
        }
      }}
      placeholder="Search the catalog…"
      className="w-full"
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only dialog whose only control is this input
      autoFocus
    />
  );
}

export function PrintingDeskCardSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New printing</DialogTitle>
          <DialogDescription>
            Pick the card first. The next step shows every printing it already has.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<Skeleton className="h-8 w-full" />}>
            <CardSearchBody
              onPick={(cardSlug) => {
                onOpenChange(false);
                void navigate({
                  to: "/admin/printing-desk/cards/$cardSlug",
                  params: { cardSlug },
                });
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
