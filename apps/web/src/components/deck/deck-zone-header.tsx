import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";

/**
 * Height is fixed so a taller trailing element can't stretch one zone's
 * header past the others.
 */
export function DeckZoneHeader({
  label,
  children,
  className,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-6 items-center gap-2 border-b", className)}>
      <SectionHeading as="span" size="sm">
        {label}
      </SectionHeading>
      {children}
    </div>
  );
}
