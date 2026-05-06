import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DefinitionList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl className={cn("border-border divide-border divide-y rounded-lg border text-sm", className)}>
      {children}
    </dl>
  );
}

export function DefinitionRow({
  label,
  icon,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex">
      <dt className="bg-muted/50 flex w-32 shrink-0 items-start gap-2 px-3 py-2.5 font-medium">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className="text-muted-foreground px-3 py-2.5">{children}</dd>
    </div>
  );
}
