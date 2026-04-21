import { BookOpenIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-is-mobile";

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
  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "sm" : undefined;
  return (
    <div
      aria-label={`${selectedCount} selected`}
      className="bg-card md:border-primary/50 fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 shadow-xl md:gap-4 md:border-2 md:px-5 md:py-3"
    >
      <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-sm font-semibold md:hidden">
        {selectedCount}
      </span>
      <span className="hidden text-base font-medium md:inline">{selectedCount} selected</span>
      <Button variant="secondary" size={buttonSize} onClick={onMove} disabled={isMovePending}>
        <BookOpenIcon />
        Move
      </Button>
      <Button
        variant="destructive"
        size={buttonSize}
        onClick={onDispose}
        disabled={isDisposePending}
      >
        <Trash2Icon />
        Dispose
      </Button>
      <Button
        variant="ghost"
        size={isMobile ? "icon-sm" : "icon"}
        onClick={onClear}
        aria-label="Clear selection"
      >
        <XIcon />
      </Button>
    </div>
  );
}
