import type { Marketplace } from "@openrift/shared";
import type { AnchorHTMLAttributes } from "react";

import { trackEvent } from "@/lib/analytics";

// For non-anchor click handlers (e.g. SVG `window.open`); normal anchors should use `<MarketplaceLink>` instead.
export function trackMarketplaceClick(marketplace: Marketplace, url: string) {
  trackEvent("marketplace-click", { marketplace, url });
}

type MarketplaceLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  marketplace: Marketplace;
  href: string;
};

export function MarketplaceLink({
  marketplace,
  href,
  target = "_blank",
  rel = "noreferrer",
  onClick,
  children,
  ...rest
}: MarketplaceLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      target={target}
      rel={rel}
      onClick={(event) => {
        trackMarketplaceClick(marketplace, href);
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
