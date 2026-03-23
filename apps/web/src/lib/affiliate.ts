const AFFILIATE_BASE = "https://partner.tcgplayer.com/openrift";

export function affiliateUrl(url: string): string {
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(url)}`;
}

const CT_SHARE_CODE = "openrift";

export function cardtraderAffiliateUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}share_code=${CT_SHARE_CODE}`;
}
