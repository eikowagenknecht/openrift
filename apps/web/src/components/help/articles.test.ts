import { describe, expect, it } from "vitest";

import { helpArticleList, visibleHelpArticles } from "./articles";

const flaggedArticles = helpArticleList.filter((article) => article.featureFlag);
const unflaggedSlugs = helpArticleList
  .filter((article) => !article.featureFlag)
  .map((article) => article.slug);

describe("visibleHelpArticles", () => {
  it("keeps every unflagged article when no flags are set", () => {
    expect(visibleHelpArticles({}).map((article) => article.slug)).toEqual(unflaggedSlugs);
  });

  it("hides a flagged article while its flag is off", () => {
    const visible = visibleHelpArticles({ "help-discord-bot": false });

    expect(visible.map((article) => article.slug)).not.toContain("discord-bot");
  });

  it("shows a flagged article once its flag is on", () => {
    const visible = visibleHelpArticles({ "help-discord-bot": true });

    expect(visible.map((article) => article.slug)).toContain("discord-bot");
  });

  it("treats a missing flag as off", () => {
    expect(visibleHelpArticles({ unrelated: true }).map((article) => article.slug)).toEqual(
      unflaggedSlugs,
    );
  });

  it("gates each flagged article independently", () => {
    // Guards the original bug: the index dropped every article that merely had
    // a `featureFlag`, so enabling one flag still showed nothing.
    for (const article of flaggedArticles) {
      const visible = visibleHelpArticles({ [article.featureFlag as string]: true });
      const slugs = visible.map((entry) => entry.slug);

      expect(slugs).toContain(article.slug);
      for (const other of flaggedArticles) {
        if (other.slug !== article.slug) {
          expect(slugs).not.toContain(other.slug);
        }
      }
    }
  });

  it("preserves declaration order", () => {
    const allFlagsOn = Object.fromEntries(
      flaggedArticles.map((article) => [article.featureFlag as string, true]),
    );

    expect(visibleHelpArticles(allFlagsOn).map((article) => article.slug)).toEqual(
      helpArticleList.map((article) => article.slug),
    );
  });
});
