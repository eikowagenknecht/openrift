import { createContext } from "react";

import { Pressable } from "@/components/ui/pressable";
import type { DeckOverviewTab } from "@/features/decks/stores/deck-builder-ui-store";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

// `null` means the host's slot hasn't attached yet (render nothing);
// `undefined` means there is no host, so a standalone consumer stays inline.
export const PlanTabActionsContext = createContext<HTMLElement | null | undefined>(undefined);

export const SECTION_SCROLL_MARGIN = "calc(var(--sticky-top, 57px) + 3.5rem)";

export function TabStrip({
  tab,
  onTabChange,
  showPlanTab,
  showBoxTab,
  trailing,
  trailingMobile,
}: {
  tab: DeckOverviewTab;
  onTabChange: (tab: DeckOverviewTab) => void;
  showPlanTab: boolean;
  showBoxTab: boolean;
  trailing?: React.ReactNode;
  trailingMobile?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const tabClass = (active: boolean) =>
    cn(
      "-mb-px border-b-2 pb-2 text-sm font-medium transition-colors",
      active
        ? "border-primary text-foreground"
        : "text-muted-foreground hover:text-foreground border-transparent",
    );
  // Exactly one of trailing/trailingMobile renders: the Plan tab's trailing is
  // a portal target and must never duplicate.
  const inlineTrailing = isMobile ? (trailingMobile ?? trailing) : trailing;
  return (
    <div role="tablist" aria-label="Deck views" className="flex h-10 items-end gap-6 border-b">
      <Pressable
        role="tab"
        aria-selected={tab === "overview"}
        className={tabClass(tab === "overview")}
        onClick={() => onTabChange("overview")}
      >
        Deck
      </Pressable>
      <Pressable
        role="tab"
        aria-selected={tab === "test"}
        className={tabClass(tab === "test")}
        onClick={() => onTabChange("test")}
      >
        Test
      </Pressable>
      {showPlanTab && (
        <Pressable
          role="tab"
          aria-selected={tab === "plan"}
          className={tabClass(tab === "plan")}
          onClick={() => onTabChange("plan")}
        >
          Plan
        </Pressable>
      )}
      {showBoxTab && (
        <Pressable
          role="tab"
          aria-selected={tab === "box"}
          className={tabClass(tab === "box")}
          onClick={() => onTabChange("box")}
        >
          Box
        </Pressable>
      )}
      {inlineTrailing && (
        <div className="ml-auto flex items-center gap-2 pb-1.5">{inlineTrailing}</div>
      )}
    </div>
  );
}
