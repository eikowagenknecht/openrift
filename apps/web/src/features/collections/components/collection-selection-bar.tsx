import { BookOpenIcon, ListPlusIcon, Trash2Icon } from "lucide-react";

import type { CollectionContextAction } from "@/features/cards/stores/card-row-actions-store";
import { FloatingActionBar } from "@/features/collections/components/floating-action-bar";

interface CollectionSelectionBarProps {
  mode: "browse" | "select";
  selected: Set<string>;
  moveIsPending: boolean;
  disposeIsPending: boolean;
  openAction: (action: CollectionContextAction, copyIds: string[]) => void;
  onClear: () => void;
}

export function CollectionSelectionBar({
  mode,
  selected,
  moveIsPending,
  disposeIsPending,
  openAction,
  onClear,
}: CollectionSelectionBarProps) {
  if (mode !== "select" || selected.size === 0) {
    return null;
  }

  return (
    <FloatingActionBar
      selectedCount={selected.size}
      actions={[
        {
          label: "Move",
          icon: <BookOpenIcon />,
          onClick: () => openAction("move", [...selected]),
          disabled: moveIsPending,
        },
        {
          label: "Add to list",
          icon: <ListPlusIcon />,
          onClick: () => openAction("addToList", [...selected]),
        },
        {
          label: "Dispose",
          icon: <Trash2Icon />,
          variant: "destructive",
          onClick: () => openAction("dispose", [...selected]),
          disabled: disposeIsPending,
        },
      ]}
      onClear={onClear}
    />
  );
}
