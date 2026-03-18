import pino from "pino";

export type Logger = pino.Logger;

/**
 * Creates a pino logger instance.
 *
 * In development, pipe output through pino-pretty for human-readable logs:
 *   `bun dev:api | bunx pino-pretty`
 *
 * In production, logs are JSON to stdout — Docker captures them as-is.
 * @returns A configured pino Logger.
 */
export function createLogger(name: string, level?: pino.LevelWithSilent): Logger {
  return pino({ name, level: level ?? "info" });
}
