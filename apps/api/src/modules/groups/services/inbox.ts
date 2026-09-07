import type { Repos } from "../../../deps.js";

export function ensureInbox(repos: Repos, userId: string): Promise<string> {
  return repos.collections.ensureInbox(userId);
}
