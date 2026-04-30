import type { Marketplace } from "@openrift/shared";
import type { AnchorHTMLAttributes } from "react";

import { trackEvent } from "@/lib/analytics";

/**
 * Records a click on an external marketplace link in Umami.
 * Use this for non-anchor click handlers (e.g. SVG `window.open`); for normal
 * anchors prefer `<MarketplaceLink>`, which calls this internally.
 * @returns void
 */
export function trackMarketplaceClick(marketplace: Marketplace, url: string) {
  trackEvent("marketplace-click", { marketplace, url });
}

type MarketplaceLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  marketplace: Marketplace;
  href: string;
};

/**
 * External link to a marketplace that records the click in Umami before
 * navigating. Defaults to opening in a new tab with `rel="noreferrer"`.
 * @returns The anchor element.
 */
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
