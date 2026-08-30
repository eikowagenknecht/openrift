import type { SourceMappingConfig } from "./price-mappings-types";

export function ProductLink({
  config,
  externalId,
  language,
  children,
}: {
  config: SourceMappingConfig;
  externalId: number;
  /** Printing language to pass through to the marketplace's language filter. */
  language?: string | null;
  children: React.ReactNode;
}) {
  return (
    <a
      href={config.productUrl(externalId, language)}
      target="_blank"
      rel="noreferrer"
      className="decoration-muted-foreground/50 hover:decoration-foreground underline underline-offset-2"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
