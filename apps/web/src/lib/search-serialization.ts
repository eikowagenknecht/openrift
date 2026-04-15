import qs from "query-string";

/**
 * Parse a search string using query-string with `arrayFormat: "comma"`, then
 * JSON-parse any primitive values that round-trip (numbers, booleans, objects)
 * so schemas validating `z.number()`/`z.boolean()` still see the right type.
 * Array values come back as arrays of strings — schemas that expect arrays
 * should also accept a single string (see `arrayOfStrings` in search-schemas).
 * @param searchStr Raw search string (with or without leading `?`).
 * @returns Parsed search object.
 */
export function parseSearch(searchStr: string): Record<string, unknown> {
  const stripped = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const parsed = qs.parse(stripped, { arrayFormat: "comma" }) as Record<string, unknown>;
  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (typeof value === "string") {
      try {
        parsed[key] = JSON.parse(value);
      } catch {
        // leave as string
      }
    }
  }
  return parsed;
}

/**
 * Stringify a search object using query-string with `arrayFormat: "comma"`.
 * Non-array objects and primitives that aren't plain strings are JSON-encoded
 * to preserve type information across the URL round-trip.
 * @param search The search object to serialize.
 * @returns A query string prefixed with `?`, or an empty string if no params.
 */
export function stringifySearch(search: Record<string, unknown>): string {
  const encoded: Record<string, unknown> = {};
  for (const key of Object.keys(search)) {
    const value = search[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      encoded[key] = value;
    } else if (typeof value === "object" && value !== null) {
      encoded[key] = JSON.stringify(value);
    } else if (typeof value === "string") {
      try {
        JSON.parse(value);
        encoded[key] = JSON.stringify(value);
      } catch {
        encoded[key] = value;
      }
    } else {
      encoded[key] = JSON.stringify(value);
    }
  }
  const str = qs.stringify(encoded, { arrayFormat: "comma" });
  return str ? `?${str}` : "";
}
