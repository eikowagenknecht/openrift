import { formatMonth } from "@openrift/shared/format-date";
import type { CardDetailResponse } from "@openrift/shared/types/api/catalog";
import type { CardErrata, Printing } from "@openrift/shared/types/catalog";
import { isBaseBanFormat } from "@openrift/shared/well-known";
import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { PrintingCitationList } from "@/components/cards/card-detail/printing-citations";
import { InfoRow } from "@/components/cards/card-page-info-row";
import { CardText } from "@/components/cards/card-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainGradientStyle } from "@/lib/domain";

type DetailProduct = CardDetailResponse["products"][number];

export function CardPageFactRows({
  card,
  printing,
  products,
}: {
  card: CardDetailResponse["card"];
  printing: Printing;
  products: DetailProduct[];
}) {
  const domainColors = useDomainColors();
  return (
    <table className="w-full table-fixed text-sm">
      <tbody>
        {printing.printedRulesText && (
          <InfoRow label="Rules">
            <p className="text-muted-foreground">
              <CardText text={card.errata?.correctedRulesText ?? printing.printedRulesText} />
            </p>
          </InfoRow>
        )}
        {printing.printedEffectText && (
          <InfoRow label="Effect">
            <div
              className="rounded-md px-2 py-1.5"
              style={getDomainGradientStyle(card.domains, "18", domainColors)}
            >
              <p className="text-muted-foreground">
                <CardText text={card.errata?.correctedEffectText ?? printing.printedEffectText} />
              </p>
            </div>
          </InfoRow>
        )}
        {printing.flavorText && (
          <InfoRow label="Flavor">
            <p className="text-muted-foreground/70 italic">{printing.flavorText}</p>
          </InfoRow>
        )}
        {printing.markers.length > 0 && (
          <InfoRow label="Promo">
            <div className="border-border/50 bg-muted/30 flex flex-wrap gap-1 rounded-md border px-2.5 py-1.5">
              {printing.markers.map((marker) => (
                <Badge key={marker.id} variant="secondary" title={marker.description ?? undefined}>
                  {marker.label}
                </Badge>
              ))}
            </div>
          </InfoRow>
        )}
        <FoundInRow printing={printing} products={products} />
        <SourcesRow printing={printing} />
        {printing.comment && (
          <InfoRow label="Note">
            <div className="border-border/50 bg-muted/30 rounded-md border px-2.5 py-1.5">
              <p className="text-muted-foreground italic">{printing.comment}</p>
            </div>
          </InfoRow>
        )}
        {card.errata && <ErrataRow errata={card.errata} printing={printing} />}
        {card.bans.length > 0 && (
          <InfoRow label="Bans">
            <Alert variant="destructive" className="space-y-1.5">
              {card.bans.map((ban) => (
                <div key={ban.formatId}>
                  <AlertTitle>
                    Banned in {ban.formatName} since {ban.bannedAt}
                  </AlertTitle>
                  {ban.reason && (
                    <AlertDescription className="mt-0.5">{ban.reason}</AlertDescription>
                  )}
                  {!isBaseBanFormat(ban.formatId) && (
                    <AlertDescription className="mt-0.5">
                      Applies to {ban.formatName} play only. The card stays legal in other
                      constructed play.
                    </AlertDescription>
                  )}
                </div>
              ))}
            </Alert>
          </InfoRow>
        )}
      </tbody>
    </table>
  );
}

function ErrataRow({ errata, printing }: { errata: CardErrata; printing: Printing }) {
  const hasRulesDiff =
    errata.correctedRulesText &&
    printing.printedRulesText &&
    errata.correctedRulesText !== printing.printedRulesText;
  const hasEffectDiff =
    errata.correctedEffectText &&
    printing.printedEffectText &&
    errata.correctedEffectText !== printing.printedEffectText;

  if (!hasRulesDiff && !hasEffectDiff) {
    return null;
  }

  const sourceLabel = errata.effectiveDate
    ? `${errata.source}, ${formatMonth(errata.effectiveDate)}`
    : errata.source;

  return (
    <InfoRow label="Errata">
      <Alert variant="warning">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <AlertTitle className="font-semibold">
          {errata.sourceUrl ? (
            <a
              href={errata.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2"
            >
              {sourceLabel}
            </a>
          ) : (
            <span>{sourceLabel}</span>
          )}
        </AlertTitle>
        {hasRulesDiff && (
          <AlertDescription className="mt-1.5">
            <span className="text-muted-foreground/60 mr-1 text-xs font-medium">
              Original rules:
            </span>
            <CardText text={printing.printedRulesText ?? ""} />
          </AlertDescription>
        )}
        {hasEffectDiff && (
          <AlertDescription className="mt-1.5">
            <span className="text-muted-foreground/60 mr-1 text-xs font-medium">
              Original effect:
            </span>
            <CardText text={printing.printedEffectText ?? ""} />
          </AlertDescription>
        )}
      </Alert>
    </InfoRow>
  );
}

/** "Found in": every sealed thing this printing came in, as one list. */
function FoundInRow({ printing, products }: { printing: Printing; products: DetailProduct[] }) {
  const entries = [
    ...products.map((product) => ({
      key: `product-${product.slug}`,
      node: <ProductLink product={product} />,
    })),
    ...printing.distributionChannels.map((link, index) => ({
      key: `channel-${link.channel.id}-${index}`,
      node: <ChannelLink link={link} language={printing.language} />,
    })),
  ];
  const [firstEntry, ...otherEntries] = entries;
  if (!firstEntry) {
    return null;
  }
  return (
    <InfoRow label="Found in">
      <div className="border-border/50 bg-muted/30 rounded-md border px-2.5 py-1.5">
        {otherEntries.length === 0 ? (
          firstEntry.node
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.key} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground/60 select-none">
                  &bull;
                </span>
                {entry.node}
              </li>
            ))}
          </ul>
        )}
      </div>
    </InfoRow>
  );
}

/** "Sources": where the claims about this printing come from. */
function SourcesRow({ printing }: { printing: Printing }) {
  const citations = printing.citations ?? [];
  if (citations.length === 0) {
    return null;
  }
  return (
    <InfoRow label={citations.length === 1 ? "Source" : "Sources"}>
      <div className="border-border/50 bg-muted/30 rounded-md border px-2.5 py-1.5">
        <PrintingCitationList citations={citations} />
      </div>
    </InfoRow>
  );
}

function ProductLink({ product }: { product: { slug: string; name: string; quantity: number } }) {
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      className="hover:text-foreground block min-w-0 flex-1"
    >
      <span className="text-muted-foreground">{product.quantity}&times; </span>
      <span className="font-semibold underline decoration-dotted underline-offset-2">
        {product.name}
      </span>
    </Link>
  );
}

function ChannelLink({
  link,
  language,
}: {
  link: Printing["distributionChannels"][number];
  language: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <Link
        to="/promos/$language"
        params={{ language }}
        hash={`lang-${language}-ch-${link.channel.id}`}
        className="hover:text-foreground block"
      >
        {link.ancestorLabels.length > 0 && (
          <span className="text-muted-foreground">
            {link.ancestorLabels.join(" › ")}
            {" › "}
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
  );
}
