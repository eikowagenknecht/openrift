import { MinusIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FloatingActionBarProps {
  selectedCount: number;
  onMove: () => void;
  onDispose: () => void;
  onClear: () => void;
  isMovePending: boolean;
  isDisposePending: boolean;
}

export function FloatingActionBar({
  selectedCount,
  onMove,
  onDispose,
  onClear,
  isMovePending,
  isDisposePending,
}: FloatingActionBarProps) {
  return (
    <div className="border-border bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 shadow-lg">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <Button variant="secondary" size="sm" onClick={onMove} disabled={isMovePending}>
        <MinusIcon className="mr-1 size-3.5" />
        Move
      </Button>
      <Button variant="destructive" size="sm" onClick={onDispose} disabled={isDisposePending}>
        <Trash2Icon className="mr-1 size-3.5" />
        Dispose
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
