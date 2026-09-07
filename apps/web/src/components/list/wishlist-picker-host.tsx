import type { ListKind } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useState } from "react";

import { AddToWishlistDialog } from "@/components/list/add-to-wishlist-dialog";
import { CreateListDialog } from "@/components/list/create-list-dialog";

export function WishlistPickerHost({
  target,
  onClose,
}: {
  target: Printing | null;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);

  if (!target) {
    return null;
  }

  const entriesFor = (kind: ListKind) =>
    kind === "card" ? [{ cardId: target.cardId }] : [{ printingId: target.id }];
  const cardName = legendDisplayName(target.card);

  const close = () => {
    setCreating(false);
    onClose();
  };

  return (
    <>
      <AddToWishlistDialog
        open={!creating}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        entriesFor={entriesFor}
        onCreateNew={() => setCreating(true)}
        onAdded={close}
      />
      <CreateListDialog
        intent="wish"
        open={creating}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        initialEntries={entriesFor}
        title={`New wishlist for "${cardName}"`}
        description="Pick whether any version of the card works, or you want a specific one."
        kindHints={{
          card: "Any printing of this card counts. Pick this if you just want to play it.",
          printing:
            "Only this exact printing counts. Pick this if you want a specific set, art, or finish.",
        }}
        onCreated={close}
      />
    </>
  );
}
