const AFFILIATE_BASE = "https://partner.tcgplayer.com/NGKP0P";

export function affiliateUrl(url: string): string {
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(url)}`;
}
