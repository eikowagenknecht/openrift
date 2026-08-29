import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { IconChipTone } from "@/components/ui/icon-chip";
import { IconChip } from "@/components/ui/icon-chip";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// ActionBand is the full-width "this needs you" band the group overview's
// trades hub established: a Card-edged surface with the warm accent wash, a
// header row (tinted icon chip, label, headline value, supporting text, and an
// optional trailing action), and free-form rows below via children. Like
// StatTile, `accent` swaps the resting ring to primary and is reserved for a
// band that's waiting on the viewer. A band given `render` (e.g. a Link) is a
// click target and picks up the StatTile hover (shadow lift + primary edge);
// without it the band is static chrome around its rows and never hovers.
// Call sites that key hover styles inside the band (a CTA span) hook into the
// `group/action-band` group.

// The band's gold wash: the warm accent token mixed toward the card surface,
// fading out by 55% along the band. Token-based (like the hero wash and the
// fan glow) so it stays visible on the dark theme — a low-alpha amber overlay
// all but disappears against the dark card.
const BAND_WASH =
  "linear-gradient(135deg, color-mix(in oklab, var(--border-accent) 14%, transparent), transparent 55%)";

/**
 * The overview-style attention band. Pass a navigation target via
 * `render={<Link ... />}` to make the whole band the click target; rows render
 * below the header via children.
 *
 * @returns The band element.
 */
function ActionBand({
  icon,
  tone = "gold",
  accent = false,
  label,
  value,
  valueClassName,
  sub,
  action,
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Icon-chip tint; the band's wash is warm, so gold is the default. */
  tone?: IconChipTone;
  /** Primary resting ring for the one band waiting on the viewer. */
  accent?: boolean;
  label: string;
  value: ReactNode;
  /**
   * Extra classes on the value span, for a band whose headline is a sentence
   * rather than a numeral (`"font-sans text-base font-medium"`). Mirrors
   * StatTile's prop of the same name.
   */
  valueClassName?: string;
  /** Supporting text after the value; truncates on narrow viewports. */
  sub?: ReactNode;
  /** Trailing header-row slot (a CTA span, a count). Pinned right. */
  action?: ReactNode;
}) {
  const interactive = render !== undefined;
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(
      {
        className: cn(
          "group/action-band bg-card flex flex-col gap-3 rounded-lg p-4 no-underline ring-1 transition-all",
          accent ? "ring-primary/40" : "ring-foreground/10",
          interactive &&
            cn("hover:shadow-md", accent ? "hover:ring-primary/50" : "hover:ring-primary/30"),
          className,
        ),
        style: { backgroundImage: BAND_WASH },
        children: (
          <>
            {/* On phones the header wraps and the supporting text takes its own
                line; inline it would truncate to a couple of characters next to
                the action. It keeps the chip's indent there (pl-13 = the size-10
                chip plus the gap-x-3), so the wrapped line stays under the label
                instead of sliding back under the icon. From sm up the row is
                single-line and sub truncates. */}
            <div className="flex min-w-0 items-center gap-x-3 gap-y-2 max-sm:flex-wrap">
              <IconChip icon={icon} tone={tone} />
              <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                {label}
              </span>
              <span
                className={cn(
                  "font-heading min-w-0 text-3xl font-semibold tabular-nums",
                  valueClassName,
                )}
              >
                {value}
              </span>
              {sub ? (
                <span className="text-muted-foreground min-w-0 text-xs max-sm:order-last max-sm:basis-full max-sm:pl-13 sm:truncate">
                  {sub}
                </span>
              ) : null}
              {action ? <span className="ml-auto flex shrink-0 items-center">{action}</span> : null}
            </div>
            {children}
          </>
        ),
      },
      props,
    ),
    state: {
      slot: "action-band",
    },
  });
}

export { ActionBand };
