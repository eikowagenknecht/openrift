import type { Printing } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";

const BREADCRUMB_SEP = " \u203A ";

/**
 * Printing-specific notes shown in the detail pane. Split into two boxes: a
 * "Promo" box (markers + distribution channels) and a separate "Note" box for
 * the printing's comment, since comments aren't always promo-related. Each
 * box is omitted when its data isn't present.
 *
 * @returns Up to two stacked boxes, or `null` when there's nothing to say.
 */
export function PrintingNotesSection({ printing }: { printing: Printing }) {
  const hasMarkers = printing.markers.length > 0;
  const hasChannels = printing.distributionChannels.length > 0;
  const hasComment = Boolean(printing.comment);
  if (!hasMarkers && !hasChannels && !hasComment) {
    return null;
  }

  return (
    <div className="space-y-3">
      {(hasMarkers || hasChannels) && (
        <section className="border-border/50 bg-muted/30 space-y-2 rounded-lg border px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="text-muted-foreground font-medium tracking-wide uppercase">Promo</h3>
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
        </section>
      )}

      {hasComment && printing.comment && (
        <section className="border-border/50 bg-muted/30 space-y-2 rounded-lg border px-3 py-2.5 text-sm">
          <h3 className="text-muted-foreground font-medium tracking-wide uppercase">Note</h3>
          <p className="text-muted-foreground italic">{printing.comment}</p>
        </section>
      )}
    </div>
  );
}
