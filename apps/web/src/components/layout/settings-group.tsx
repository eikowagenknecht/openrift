import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A labelled group of settings cards. Renders an uppercase muted heading and a
 * scroll anchor matching its {@link PageToc} entry, then stacks its children
 * (one or more `Card`s) below. Each card inside carries its own `id` +
 * `scroll-mt-16` for the TOC sub-items. Shared by the profile page and the
 * tournament settings tab.
 * @returns The settings group section.
 */
export function SettingsGroup({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 space-y-6", className)}>
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}
