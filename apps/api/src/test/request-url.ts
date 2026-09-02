/**
 * The URL a fetch call was made with. A `Request` has no useful `toString`,
 * so stringifying the argument yields "[object Request]".
 * @returns The request URL.
 */
export function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}
