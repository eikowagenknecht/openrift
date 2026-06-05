import { apiErrorResponseSchema } from "@openrift/shared/response-schemas";

/**
 * Standard error-response declarations for `createRoute`, all referencing the
 * shared `{ error, code }` envelope so the OpenAPI document (and the typed
 * client) describe the failure contract instead of pretending every endpoint
 * only succeeds.
 *
 * Spread the result into a route's `responses`:
 *
 *   responses: { 200: { ... }, ...errorResponses(401, 404) }
 */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409;

interface ErrorResponseEntry {
  description: string;
  content: { "application/json": { schema: typeof apiErrorResponseSchema } };
}

const ERROR_STATUS_DESCRIPTIONS: Record<ErrorStatus, string> = {
  400: "Invalid request (schema validation or malformed input)",
  401: "Authentication required",
  403: "Forbidden — authenticated but not permitted",
  404: "Not found",
  409: "Conflict with the current resource state",
};

/**
 * @returns OpenAPI response entries for the given error statuses, each carrying
 *   the shared error-envelope schema. The return type maps the exact status
 *   keys (no `| undefined`) so `createRoute`/`hc` infer the json error body —
 *   a `Partial<Record<...>>` here would make the typed client see the error
 *   body as `{}` (format `string`) and break the `callApiJson` narrowing.
 */
export function errorResponses<const Statuses extends readonly ErrorStatus[]>(
  ...statuses: Statuses
): Record<Statuses[number], ErrorResponseEntry> {
  const responses: Partial<Record<ErrorStatus, ErrorResponseEntry>> = {};
  for (const status of statuses) {
    responses[status] = {
      description: ERROR_STATUS_DESCRIPTIONS[status],
      content: { "application/json": { schema: apiErrorResponseSchema } },
    };
  }
  return responses as Record<Statuses[number], ErrorResponseEntry>;
}

/**
 * Security requirement for routes behind `requireAuth`. References the
 * `cookieAuth` scheme registered on the root app (see createApp in app.ts).
 */
export const cookieAuth = [{ cookieAuth: [] }];
