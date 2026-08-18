import { cn } from "@/lib/utils";

/**
 * How many contributors are named before the line collapses to a count.
 *
 * A single hidden name would read "and 1 other", which is both clumsy and
 * meaner than just printing it, so {@link contributorLine} absorbs an overflow
 * of exactly one — four names are named in full, five become three and a count.
 */
const MAX_NAMED_CONTRIBUTORS = 3;

/**
 * "Alice", "Alice and Bob", "Alice, Bob and Carol", "Alice, Bob, Carol and 3
 * others".
 *
 * Built by hand rather than through `Intl.ListFormat` so the string is the same
 * for every reader — the archive's other rendered text is locale-free for the
 * same reason.
 *
 * @param names The contributors' display names.
 * @returns The joined line, without the leading "Contributed by".
 */
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

/**
 * Who typed this archive entry in (ADR-014). Opt-in and public, which is why a
 * contributor is worth naming at all.
 *
 * Shared by the event page and the archived deck page so the sentence and its
 * truncation rule are written once: an event and one of its decks disagreeing
 * about how to say "and 2 others" would be a visible seam between two pages a
 * reader moves straight between.
 *
 * The names arrive resolved and already filtered by each contributor's
 * visibility setting, so this renders them as given and never sees a user id.
 * They are plain text on purpose: linking a credit to someone's profile is a
 * separate consent question the ADR puts out of scope.
 *
 * @param props.contributors The public contributor names.
 * @param props.className Spacing for the surface it sits on.
 * @returns The contributor line, or null when nobody is credited.
 */
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
