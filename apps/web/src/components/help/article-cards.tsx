import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * A numbered step in a walkthrough. Steps are rendered as a vertical stack, one card per step.
 *
 * @returns The step card.
 */
export function StepRow({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3">
        <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {step}
        </span>
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * An icon-led card describing one feature, option, or capability. The `dashed` variant marks
 * something that does not exist yet (a gap), so it reads as an outline rather than a feature.
 *
 * @returns The feature card.
 */
export function FeatureCard({
  icon,
  title,
  shortcut,
  description,
  variant = "default",
}: {
  icon: ReactNode;
  title: string;
  shortcut?: string;
  description: ReactNode;
  variant?: "default" | "dashed";
}) {
  const dashed = variant === "dashed";
  return (
    <Card className={cn(dashed && "border border-dashed ring-0")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={dashed ? "text-muted-foreground" : "text-primary"}>{icon}</span>
          {title}
          {shortcut && <Kbd className="px-1.5">{shortcut}</Kbd>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * A deck zone with its card count, used by the deck-building and how-to-play articles.
 *
 * @returns The zone card.
 */
export function ZoneCard({
  name,
  count,
  description,
  color,
}: {
  name: string;
  count: string;
  description: ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={color}>{name}</span>
          <span className="bg-muted text-muted-foreground text-2xs rounded-full px-1.5 tabular-nums">
            {count}
          </span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
