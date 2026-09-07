import type { Printing } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { PrintingCitationList } from "@/components/cards/card-detail/printing-citations";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { SectionHeading } from "@/components/ui/section-heading";

const BREADCRUMB_SEP = " \u203A ";

export function PrintingNotesSection({ printing }: { printing: Printing }) {
  const hasMarkers = printing.markers.length > 0;
  const hasChannels = printing.distributionChannels.length > 0;
  const hasComment = Boolean(printing.comment);
  const citations = printing.citations ?? [];
  if (!hasMarkers && !hasChannels && !hasComment && citations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {(hasMarkers || hasChannels) && (
        <Callout className="space-y-2 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <SectionHeading as="h3">Promo</SectionHeading>
            {hasMarkers && (
              <div className="flex flex-wrap justify-end gap-1">
                {printing.markers.map((marker) => (
                  <Badge
                    key={marker.id}
                    variant="secondary"
                    title={marker.description ?? undefined}
                  >
                    {marker.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {hasChannels && (
            <ul className="space-y-1">
              {printing.distributionChannels.map((link, index) => (
                <li key={`${link.channel.id}-${index}`} className="flex gap-2">
                  <span aria-hidden className="text-muted-foreground/60 select-none">
                    &bull;
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/promos/$language"
                      params={{ language: printing.language }}
                      hash={`lang-${printing.language}-ch-${link.channel.id}`}
                      className="hover:text-foreground block"
                    >
                      {link.ancestorLabels.length > 0 && (
                        <span className="text-muted-foreground">
                          {link.ancestorLabels.join(BREADCRUMB_SEP)}
                          {BREADCRUMB_SEP}
                        </span>
                      )}
                      <span className="font-semibold underline decoration-dotted underline-offset-2">
                        {link.channel.label}
                      </span>
                    </Link>
                    {link.distributionNote && (
                      <p className="text-muted-foreground italic">{link.distributionNote}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Callout>
      )}

      {citations.length > 0 && (
        <Callout className="space-y-2 px-3 py-2.5 text-sm">
          <SectionHeading as="h3">{citations.length === 1 ? "Source" : "Sources"}</SectionHeading>
          <PrintingCitationList citations={citations} />
        </Callout>
      )}

      {hasComment && printing.comment && (
        <Callout className="space-y-2 px-3 py-2.5 text-sm">
          <SectionHeading as="h3">Note</SectionHeading>
          <p className="text-muted-foreground italic">{printing.comment}</p>
        </Callout>
      )}
    </div>
  );
}
