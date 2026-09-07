import type { PrintingCitation } from "@openrift/shared";
import { LinkIcon } from "lucide-react";

import { BrandGlyph } from "@/components/ui/brand-glyph";
import { sourceBrand } from "@/lib/source-brand";

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

export function PrintingCitationList({ citations }: { citations: readonly PrintingCitation[] }) {
  const [first, ...rest] = citations;
  if (!first) {
    return null;
  }
  if (rest.length === 0) {
    return <CitationEntry citation={first} />;
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
