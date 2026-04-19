import type { Printing } from "@openrift/shared";

import { MarkdownText } from "@/components/markdown-text";
import { Badge } from "@/components/ui/badge";

const BREADCRUMB_SEP = " \u203A ";

/**
 * Printing-specific notes shown on the detail page: markers, distribution
 * channels with their breadcrumbs and descriptions, and the printing's own
 * comment. Renders nothing when all three are empty, so standard booster
 * printings keep the current clean layout.
 *
 * @returns A labeled block, or `null` when there's nothing to say.
 */
export function PrintingNotesSection({ printing }: { printing: Printing }) {
  const hasMarkers = printing.markers.length > 0;
  const hasChannels = printing.distributionChannels.length > 0;
  const hasComment = Boolean(printing.comment);
  if (!hasMarkers && !hasChannels && !hasComment) {
    return null;
  }

  return (
    <dl className="border-border/50 bg-muted/30 space-y-3 rounded-lg border px-3 py-2.5 text-sm">
      {hasMarkers && (
        <Row label="Markers">
          <div className="flex flex-wrap gap-1">
            {printing.markers.map((marker) => (
              <Badge key={marker.id} variant="secondary" title={marker.description ?? undefined}>
                {marker.label}
              </Badge>
            ))}
          </div>
        </Row>
      )}

      {hasChannels && (
        <Row label="Distribution">
          <div className="space-y-2">
            {printing.distributionChannels.map((link, index) => (
              <div key={`${link.channel.id}-${index}`}>
                <p>
                  {link.ancestorLabels.length > 0 && (
                    <span className="text-muted-foreground">
                      {link.ancestorLabels.join(BREADCRUMB_SEP)}
                      {BREADCRUMB_SEP}
                    </span>
                  )}
                  <span className="font-semibold">{link.channel.label}</span>
                </p>
                {link.channel.description && (
                  <MarkdownText text={link.channel.description} className="text-muted-foreground" />
                )}
                {link.distributionNote && (
                  <p className="text-muted-foreground italic">{link.distributionNote}</p>
                )}
              </div>
            ))}
          </div>
        </Row>
      )}

      {hasComment && printing.comment && (
        <Row label="Note">
          <p className="text-muted-foreground italic">{printing.comment}</p>
        </Row>
      )}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
