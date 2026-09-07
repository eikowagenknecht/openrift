import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MoveDialog } from "@/components/collection/move-dialog";
import { useCollections } from "@/hooks/use-collections";
import { useMoveCopies } from "@/hooks/use-copies";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";

interface MoveCopiesToCollectionDialogProps {
  listId: string;
  copyIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved?: () => void;
}

/**
 * The list is left alone; membership follows the copy. The list detail query
 * is invalidated because a dynamic rule scoped to source collections stops
 * matching once the copies land elsewhere.
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
