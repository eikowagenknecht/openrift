/** A `Request` has no useful `toString`; stringifying it yields "[object Request]". */
export function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}
