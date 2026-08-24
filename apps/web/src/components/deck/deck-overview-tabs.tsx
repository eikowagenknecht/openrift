import { createContext } from "react";

import { Pressable } from "@/components/ui/pressable";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import type { DeckOverviewTab } from "@/stores/deck-builder-ui-store";

/**
 * The Plan tab's action slot in the tab strip. The tab's content (the plan
 * editor) portals its save / clear controls in here so they share the tab row
 * with the other tabs' trailing controls instead of stacking a second bar
 * underneath. `null` means the host's slot hasn't attached yet (render
 * nothing); the `undefined` default means there is no host at all, so a
 * standalone consumer keeps its actions inline.
 */
export const PlanTabActionsContext = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Anchor offset for the in-page anchors (#deck-stats, #deck-cards): the
 * sticky chain (header + page top bar, published as --sticky-top by the
 * hosts) plus breathing room.
 */
export const SECTION_SCROLL_MARGIN = "calc(var(--sticky-top, 57px) + 3.5rem)";

/**
 * Editor tab strip under the hero (mock A): Deck | Stats | Test | Plan, with
 * the accent underline marking the active tab. The Plan tab hosts the plan
 * editor itself, so every tab is a real destination.
 * @returns The tab strip.
 */
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
  /** Only a deck with a home collection has a box to fill. */
  showBoxTab: boolean;
  /** Right-aligned controls sharing the row (view toggles on the Deck tab). */
  trailing?: React.ReactNode;
  /**
   * Phone replacement for {@link trailing}, for a cluster too wide to share
   * the tab row at that size. Omitted, `trailing` runs on every viewport.
   */
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
  // Everything the tabs carry shares their row, on every viewport. Only the
  // Deck tab's cluster is too wide for a phone, and it hands over a compact
  // stand-in rather than claiming a second row; the Plan tab's save / clear
  // actions already shed their labels below `sm` and fit as they are. Exactly
  // one of the two renders (the Plan tab's trailing is a portal target, so it
  // must never duplicate).
  const inlineTrailing = isMobile ? (trailingMobile ?? trailing) : trailing;
  // Same vocabulary as the share page's section nav — the two surfaces must not
  // name the same things differently. The charts have no tab of their own: they
  // sit inside the Deck tab, above the grid their bars filter.
  return (
    // items-end keeps the tab underlines glued to the rule; the fixed height
    // reserves the trailing controls' room on every tab, so switching from
    // Deck (which has them) to Test/Plan doesn't shift the layout.
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
