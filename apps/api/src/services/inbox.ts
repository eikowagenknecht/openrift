import type { Repos } from "../deps.js";

/**
 * Ensures the user has an inbox collection. Creates one if it doesn't exist.
 * @returns The inbox collection ID
 */
export function ensureInbox(repos: Repos, userId: string): Promise<string> {
  return repos.collections.ensureInbox(userId);
}
