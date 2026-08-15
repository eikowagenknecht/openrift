/**
 * Fixed third-party links for OpenRift's community and source code. These are
 * external destinations (not site-origin URLs), so a constant module is the
 * right home: one place to update if an invite or repo path ever changes.
 */
export const SOCIAL_LINKS = {
  discordInvite: "https://discord.gg/Qb6RcjXq6z",
  discordBotInvite:
    "https://discord.com/oauth2/authorize?client_id=1532050240641831103&scope=bot+applications.commands&permissions=274877991936",
  githubRepo: "https://github.com/openriftapp/openrift",
  /**
   * The current signed Firefox build of the deck importer. Every release
   * re-uploads the .xpi to the fixed `extension-updates` tag under this name,
   * so the link never needs bumping. GitHub's own `releases/latest` pointer
   * can't serve this: the app's releases own it.
   *
   * Mirrors `LATEST_XPI_URL` in
   * `apps/extension/src/lib/firefox-distribution.ts`, which the web app cannot
   * import (the extension is not one of its dependencies).
   */
  extensionDownload:
    "https://github.com/openriftapp/openrift/releases/download/extension-updates/openrift-deck-importer.xpi",
  githubIssues: "https://github.com/openriftapp/openrift/issues",
  githubNewIssue: "https://github.com/openriftapp/openrift/issues/new/choose",
  githubCommits: "https://github.com/openriftapp/openrift/commits/main/",
} as const;
