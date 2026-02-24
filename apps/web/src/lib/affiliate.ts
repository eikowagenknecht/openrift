const AFFILIATE_PARAM = "utm_campaign=affiliate&utm_medium=openrift&utm_source=impact";

export function affiliateUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${AFFILIATE_PARAM}`;
}
