import type { PrintingCitation } from "@openrift/shared";
import { LinkIcon } from "lucide-react";

import { BrandGlyph } from "@/components/ui/brand-glyph";
import { sourceBrand } from "@/lib/source-brand";

/**
 * One citation: its brand mark plus the label, linked when there is somewhere
 * to go. A citation with no URL still renders — an admin transcribing from a
 * stream nobody archived is owed the same credit as a linkable one, and hiding
 * it would make the claim look unsourced.
 *
 * @returns The citation row's content.
 */
function CitationEntry({ citation }: { citation: PrintingCitation }) {
  const glyph = (
    <BrandGlyph
      icon={sourceBrand(citation.sourceUrl)}
      fallback={LinkIcon}
      className="size-3.5 translate-y-0.5"
    />
  );

  if (citation.sourceUrl === null) {
    return (
      <span className="text-muted-foreground flex min-w-0 gap-1.5">
        {glyph}
        <span className="min-w-0">{citation.label}</span>
      </span>
    );
  }

  return (
    <a
      href={citation.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="hover:text-foreground flex min-w-0 gap-1.5"
    >
      {glyph}
      <span className="min-w-0 underline decoration-dotted underline-offset-2">
        {citation.label}
      </span>
    </a>
  );
}

/**
 * The citations backing what the catalog says about a promo printing, as a bare
 * list. Both card-detail arrangements (the pane's notes boxes and the standalone
 * page's info rows) wrap this in their own chrome, so the row treatment stays
 * identical wherever it lands.
 *
 * Every citation is printed, none collapsed behind a "+2 more": this is
 * attribution, and the fourth source is owed its credit as much as the first.
 *
 * @returns The citation list, or null when the printing has none.
 */
export function PrintingCitationList({ citations }: { citations: readonly PrintingCitation[] }) {
  if (citations.length === 0) {
    return null;
  }
  // A lone citation needs no bullet to separate it from neighbours it does not
  // have, matching how "Found in" renders a single entry.
  if (citations.length === 1) {
    return <CitationEntry citation={citations[0]} />;
  }
  return (
    <ul className="space-y-1">
      {citations.map((citation) => (
        <li key={citation.id} className="flex gap-2">
          <span aria-hidden className="text-muted-foreground/60 select-none">
            &bull;
          </span>
          <CitationEntry citation={citation} />
        </li>
      ))}
    </ul>
  );
}
