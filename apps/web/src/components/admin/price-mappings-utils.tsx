import type { SourceMappingConfig } from "./price-mappings-types";

// oxlint-disable-next-line no-empty-function -- intentional no-op for non-interactive CardThumbnail
export const NOOP = () => {};

export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function ProductLink({
  config,
  externalId,
  children,
}: {
  config: SourceMappingConfig;
  externalId: number;
  children: React.ReactNode;
}) {
  return (
    <a
      href={config.productUrl(externalId)}
      target="_blank"
      rel="noreferrer"
      className="decoration-muted-foreground/50 hover:decoration-foreground underline underline-offset-2"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
