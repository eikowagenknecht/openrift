import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

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
