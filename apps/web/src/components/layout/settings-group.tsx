import type { ReactNode } from "react";
import { useState } from "react";

import { ExpandToggle } from "@/components/ui/expand-toggle";
import { cn } from "@/lib/utils";

/**
 * A labelled group of settings cards. Renders an uppercase muted heading and a
 * scroll anchor matching its {@link PageToc} entry, then stacks its children
 * (one or more `Card`s) below. Each card inside carries its own `id` +
 * `scroll-mt-16` for the TOC sub-items. Shared by the profile page and the
 * tournament settings tab.
 *
 * With `collapsible`, the heading becomes a disclosure toggle and the cards
 * can be folded away; `defaultCollapsed` starts the group folded.
 * @returns The settings group section.
 */
export function SettingsGroup({
  id,
  title,
  children,
  className,
  collapsible = false,
  defaultCollapsed = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(!(collapsible && defaultCollapsed));
  const heading = "text-muted-foreground text-sm font-medium tracking-wide uppercase";
  return (
    <section id={id} className={cn("scroll-mt-16 space-y-6", className)}>
      {collapsible ? (
        <h2>
          {/* The heading classes sit on the button: the CSS reset puts
              text-transform: none on buttons, so uppercase on the h2 alone
              would not reach the label. */}
          <ExpandToggle
            expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className={heading}
          >
            {title}
          </ExpandToggle>
        </h2>
      ) : (
        <h2 className={heading}>{title}</h2>
      )}
      {expanded ? children : null}
    </section>
  );
}
