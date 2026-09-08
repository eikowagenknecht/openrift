import { formatReleasePeriod, isReleasedAnywhere } from "@openrift/shared/set-release";
import { Link } from "@tanstack/react-router";

import type { SetEntry } from "@/features/rules/lib/glossary-content";
import { NUMBERING_PATTERNS } from "@/features/rules/lib/glossary-content";
import { matches } from "@/features/rules/lib/glossary-search";

import { GlossarySectionHeading } from "./glossary-shared";

export function SetsSection({ sets, query }: { sets: SetEntry[]; query: string }) {
  const visible = sets.filter((setEntry) =>
    matches(query, setEntry.slug, setEntry.name, setEntry.setType),
  );
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="sets" title="Sets" />
      <p className="text-muted-foreground mt-2">
        Sets are how Riftbound releases new cards. Each set has a three-letter code that prefixes
        every card number in it, and is classified as either a main set (the regular release
        cadence) or a supplemental set (smaller drops outside the main schedule). Browse the full
        catalogue of any set on the{" "}
        <Link to="/sets" className="text-primary hover:underline">
          Sets page
        </Link>
        .
      </p>
      <ul className="mt-4 grid gap-2 lg:grid-cols-2">
        {visible.map((set) => (
          <li key={set.slug} className="rounded-md border p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <code className="bg-muted shrink-0 rounded-md px-2 py-0.5 font-mono">{set.slug}</code>
              <Link
                to="/sets/$setSlug"
                params={{ setSlug: set.slug }}
                className="font-medium hover:underline"
              >
                {set.name}
              </Link>
              <span className="text-muted-foreground capitalize">{set.setType}</span>
              {!isReleasedAnywhere(set.releases) && (
                <span className="bg-warning-soft text-warning rounded-md px-1.5 py-0.5 text-xs">
                  Unreleased
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {set.cardCount} {set.cardCount === 1 ? "card" : "cards"}
              {Object.keys(set.releases)
                .toSorted()
                .map((language) => ` · ${language} ${formatReleasePeriod(set.releases[language])}`)
                .join("")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NumberingSection({ query }: { query: string }) {
  const visible = NUMBERING_PATTERNS.filter((item) => matches(query, item.pattern, item.summary));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="numbering" title="Card numbering" />
      <p className="text-muted-foreground mt-2">
        Every printing has a short code combining the three-letter set code with a card number, like
        OGN-007.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((item) => (
          <li key={item.pattern} className="flex gap-3 rounded-md border p-3">
            <code className="bg-muted shrink-0 self-start rounded-md px-2 py-0.5 font-mono">
              {item.pattern}
            </code>
            <p className="text-muted-foreground">{item.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
