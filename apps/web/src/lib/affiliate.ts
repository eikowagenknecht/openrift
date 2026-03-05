const AFFILIATE_BASE = "https://partner.tcgplayer.com/openrift";

export function affiliateUrl(url: string): string {
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(url)}`;
}
