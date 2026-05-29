import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-is-mobile";

export interface FloatingAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: "secondary" | "destructive";
  disabled?: boolean;
}

interface FloatingActionBarProps {
  selectedCount: number;
  /** Action buttons rendered between the count and the clear button. */
  actions: FloatingAction[];
  onClear: () => void;
}

/**
 * Bottom-centered bar shown in select mode. The owning surface supplies the
 * action buttons (Move / Add to list / Dispose for collections, Move / Remove
 * for lists); this component only owns the count, mobile sizing, and clear.
 * @returns The floating action bar.
 */
export function FloatingActionBar({ selectedCount, actions, onClear }: FloatingActionBarProps) {
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
      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant ?? "secondary"}
          size={buttonSize}
          onClick={() => action.onClick()}
          disabled={action.disabled}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
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
