import { recordSpanError } from "@openrift/shared/otel";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("openrift-api/repo");

type AnyFunction = (...args: unknown[]) => unknown;
type RepoLike = Record<string, unknown>;

/**
 * Wraps each method of a repository in an OTel span named
 * `repo.<repoName>.<methodName>`, so traces show repo-method attribution
 * as the parent of the underlying `db.query` spans emitted by Kysely's
 * tracing dialect.
 *
 * Non-function properties pass through unchanged. Exceptions are recorded
 * on the span and the span status is set to ERROR before re-throwing.
 *
 * @param name - Repo name used as the span-name prefix.
 * @param repo - Object whose methods should be wrapped.
 * @returns A new object with the same shape; functions are wrapped.
 */
export const instrumentRepo = <R extends RepoLike>(name: string, repo: R): R => {
  const wrapped: RepoLike = {};
  for (const key of Object.keys(repo)) {
    const value = repo[key];
    if (typeof value !== "function") {
      wrapped[key] = value;
      continue;
    }
    const fn = value as AnyFunction;
    wrapped[key] = function instrumented(this: unknown, ...args: unknown[]) {
      const receiver = this ?? wrapped;
      return tracer.startActiveSpan(`repo.${name}.${key}`, async (span) => {
        try {
          return await fn.apply(receiver, args);
        } catch (error) {
          recordSpanError(span, error);
          throw error;
        } finally {
          span.end();
        }
      });
    };
  }
  return wrapped as R;
};
