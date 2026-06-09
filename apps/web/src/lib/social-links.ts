/**
 * Fixed third-party links for OpenRift's community and source code. These are
 * external destinations (not site-origin URLs), so a constant module is the
 * right home: one place to update if an invite or repo path ever changes.
 */
export const SOCIAL_LINKS = {
  discordInvite: "https://discord.gg/Qb6RcjXq6z",
  githubRepo: "https://github.com/openriftapp/openrift",
  githubIssues: "https://github.com/openriftapp/openrift/issues",
  githubNewIssue: "https://github.com/openriftapp/openrift/issues/new/choose",
  githubCommits: "https://github.com/openriftapp/openrift/commits/main/",
  githubDataRepo: "https://github.com/openriftapp/openrift-data",
} as const;
