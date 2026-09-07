import { cn } from "@/lib/utils";

const MAX_NAMED_CONTRIBUTORS = 3;

function contributorLine(names: readonly string[]): string {
  const hiddenCount = names.length - MAX_NAMED_CONTRIBUTORS;
  const shown = hiddenCount > 1 ? names.slice(0, MAX_NAMED_CONTRIBUTORS) : [...names];
  const remainder = names.length - shown.length;
  const tail = remainder > 0 ? `${remainder} others` : shown.pop();
  if (shown.length === 0) {
    return tail ?? "";
  }
  return `${shown.join(", ")} and ${tail}`;
}

// Names arrive already filtered by each contributor's visibility setting and
// render as plain text; linking to a profile is a separate consent question.
export function MetaContributors({
  contributors,
  className,
}: {
  contributors: readonly string[];
  className?: string;
}) {
  if (contributors.length === 0) {
    return null;
  }
  return (
    <p className={cn("text-muted-foreground text-sm", className)}>
      Contributed by {contributorLine(contributors)}
    </p>
  );
}
