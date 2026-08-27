import type { ListKind, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useState } from "react";

import { AddToWishlistDialog } from "@/components/list/add-to-wishlist-dialog";
import { CreateListDialog } from "@/components/list/create-list-dialog";

/**
 * The "which wishlist?" flow for one card, hosted once per surface and
 * re-targeted by whichever cell the viewer clicked. The two dialogs it owns are
 * the existing pair: pick an existing wishlist, or create one and land the card
 * on it.
 *
 * A wish is a card- or printing-kind entry, never a copy — the card need not be
 * owned — so the entry is shaped from the list the viewer picks: a card-kind
 * list takes any printing of the card, a printing-kind list pins this exact one.
 *
 * Mounted only while a target is set, because AddToWishlistDialog reads the
 * viewer's wishlists with a suspense query in its body.
 * @returns The dialog pair, or nothing when no card is targeted.
 */
export function WishlistPickerHost({
  target,
  onClose,
}: {
  /** The printing the viewer wants, or null when the picker is closed. */
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
