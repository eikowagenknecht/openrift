import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MoveDialog } from "@/components/collection/move-dialog";
import { useCollections } from "@/hooks/use-collections";
import { useMoveCopies } from "@/hooks/use-copies";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";

interface MoveCopiesToCollectionDialogProps {
  /** The list the copies were picked from — its detail query is refreshed after the move. */
  listId: string;
  /** The physical copies to move. Empty while the dialog is closed. */
  copyIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful move, so a caller in select mode can clear its selection. */
  onMoved?: () => void;
}

/**
 * Moves the copies behind a set of copy-kind list entries into another
 * collection, reusing the /collections {@link MoveDialog} picker. Every copy in
 * `copyIds` moves — there is no per-card quantity choice, since a copy entry is
 * already one physical card.
 *
 * The list itself is left alone: membership follows the copy, so a manually
 * added entry survives the move. A dynamic rule restricted to source
 * collections (ADR-034) stops matching once the copies land elsewhere, which is
 * what makes "sorted out, now filed away" self-clearing — hence the list
 * refresh on success.
 * @returns The collection picker dialog wired to the move mutation.
 */
export function MoveCopiesToCollectionDialog({
  listId,
  copyIds,
  open,
  onOpenChange,
  onMoved,
}: MoveCopiesToCollectionDialogProps) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: collections } = useCollections();
  const moveCopies = useMoveCopies();

  const handleMove = (toCollectionId: string) => {
    const count = copyIds.length;
    moveCopies.mutate(
      { copyIds, toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${count} ${count === 1 ? "copy" : "copies"} to collection`);
          onOpenChange(false);
          onMoved?.();
          if (userId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.lists.detail(userId, listId),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
          }
        },
      },
    );
  };

  return (
    <MoveDialog
      open={open}
      onOpenChange={onOpenChange}
      collections={collections}
      count={copyIds.length}
      onMove={(toCollectionId) => handleMove(toCollectionId)}
      isPending={moveCopies.isPending}
    />
  );
}
