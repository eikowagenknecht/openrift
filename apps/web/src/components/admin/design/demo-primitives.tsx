import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { formatSpecLine, isTransparentColor, useElementSpec } from "@/hooks/use-element-spec";
import { cn } from "@/lib/utils";

export function DemoSection({
  id,
  title,
  note,
  docs,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  docs?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-(--sticky-top) space-y-4">
      <div className="space-y-1">
        <Heading level={2}>{title}</Heading>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
        {docs && <p className="text-muted-foreground text-2xs font-mono">→ {docs}</p>}
      </div>
      {children}
    </section>
  );
}

export function DemoRow({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
    </div>
  );
}

export function SwatchRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <DemoRow label={label} hint={hint} className="items-end gap-x-5 gap-y-4">
      {children}
    </DemoRow>
  );
}

export function Swatch({
  label,
  colors = false,
  children,
}: {
  label: string;
  colors?: boolean;
  children: ReactNode;
}) {
  const { ref, spec } = useElementSpec<HTMLDivElement>();
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} className="flex items-start">
        {children}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-xs">{label}</p>
          {colors && spec && (
            <span className="flex items-center gap-1">
              {!isTransparentColor(spec.background) && (
                <ColorChip value={spec.background} label={`bg ${spec.background}`} />
              )}
              <ColorChip value={spec.color} label={`text ${spec.color}`} />
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-2xs font-mono">
          {spec ? formatSpecLine(spec) : "measuring…"}
        </p>
      </div>
    </div>
  );
}

function ColorChip({ value, label }: { value: string; label: string }) {
  return (
    <span
      title={label}
      className="border-border-opaque inline-block size-3 shrink-0 rounded-sm border"
      style={{ backgroundColor: value }}
    />
  );
}

export function Demo({
  name,
  hint,
  spec,
  children,
  className,
}: {
  name: string;
  hint: string;
  spec?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-lg border p-3", className)}>
      <div className="space-y-0.5">
        <p className="font-mono text-sm font-medium">{name}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
        {spec && <p className="text-muted-foreground text-2xs font-mono">{spec}</p>}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap content-start items-center gap-2">
        {children}
      </div>
    </div>
  );
}

export function DemoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
