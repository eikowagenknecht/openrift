/** Shape of every JSON error response from the API. */
export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}
