import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import type { ApiContext } from "../../../orpc/context.js";
import { createSlugTaxonomyHandlers } from "./slug-taxonomy-router.js";

function mockRepo() {
  return {
    listAll: vi.fn(),
    getBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteBySlug: vi.fn(),
    isInUse: vi.fn(),
    reorder: vi.fn(),
  };
}

function contextWith(repoKey: string, repo: ReturnType<typeof mockRepo>): ApiContext {
  return { repos: { [repoKey]: repo } } as unknown as ApiContext;
}

const baseRow = { slug: "primary", label: "Primary", sortOrder: 0, isWellKnown: false };

describe("createSlugTaxonomyHandlers", () => {
  describe("list", () => {
    it("wraps the repo rows under the repoKey", async () => {
      const repo = mockRepo();
      repo.listAll.mockResolvedValue([baseRow]);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });

      const result = await handlers.list({ context: contextWith("finishes", repo) });
      expect(result).toEqual({ finishes: [baseRow] });
    });
  });

  describe("reorder", () => {
    it("validates against the current rows and calls repo.reorder", async () => {
      const repo = mockRepo();
      repo.listAll.mockResolvedValue([baseRow, { ...baseRow, slug: "secondary" }]);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });

      await handlers.reorder({
        input: { slugs: ["secondary", "primary"] },
        context: contextWith("finishes", repo),
      });
      expect(repo.reorder).toHaveBeenCalledWith(["secondary", "primary"]);
    });

    it("uses the lowercased entity name in the unknown-slugs message", async () => {
      const repo = mockRepo();
      repo.listAll.mockResolvedValue([baseRow]);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "artVariants",
        entityName: "Art variant",
        createKey: "artVariant",
        inUseBy: "one or more printings",
      });

      await expect(
        handlers.reorder({
          input: { slugs: ["nope"] },
          context: contextWith("artVariants", repo),
        }),
      ).rejects.toThrow(/art variant slugs/u);
    });

    it("runs afterReorder once the reorder succeeds", async () => {
      const repo = mockRepo();
      repo.listAll.mockResolvedValue([baseRow]);
      const afterReorder = vi.fn().mockResolvedValue(undefined);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
        afterReorder,
      });

      const context = contextWith("finishes", repo);
      await handlers.reorder({ input: { slugs: ["primary"] }, context });
      expect(afterReorder).toHaveBeenCalledWith(context);
    });
  });

  describe("create", () => {
    it("omits color when hasColor is not set", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(undefined);
      repo.create.mockResolvedValue(baseRow);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });

      const result = await handlers.create({
        input: { slug: "primary", label: "Primary" },
        context: contextWith("finishes", repo),
      });
      expect(repo.create).toHaveBeenCalledWith({ slug: "primary", label: "Primary" });
      expect(result).toEqual({ finish: baseRow });
    });

    it("passes color through when hasColor is set", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(undefined);
      const created = { ...baseRow, color: "#aabbcc" };
      repo.create.mockResolvedValue(created);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "domains",
        entityName: "Domain",
        createKey: "domain",
        inUseBy: "one or more cards",
        hasColor: true,
      });

      const result = await handlers.create({
        input: { slug: "primary", label: "Primary", color: "#aabbcc" },
        context: contextWith("domains", repo),
      });
      expect(repo.create).toHaveBeenCalledWith({
        slug: "primary",
        label: "Primary",
        color: "#aabbcc",
      });
      expect(result).toEqual({ domain: created });
    });

    it("throws a 409 when the slug is already taken", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(baseRow);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });

      await expect(
        handlers.create({
          input: { slug: "primary", label: "Primary" },
          context: contextWith("finishes", repo),
        }),
      ).rejects.toThrow(/already exists/u);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("only updates the label when hasColor is not set, and skips a falsy label", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(baseRow);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });
      const context = contextWith("finishes", repo);

      await handlers.update({ input: { slug: "primary", label: "" }, context });
      expect(repo.update).not.toHaveBeenCalled();

      await handlers.update({ input: { slug: "primary", label: "Renamed" }, context });
      expect(repo.update).toHaveBeenCalledWith("primary", { label: "Renamed" });
    });

    it("updates only the provided fields when hasColor is set", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue({ ...baseRow, color: "#aabbcc" });
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "domains",
        entityName: "Domain",
        createKey: "domain",
        inUseBy: "one or more cards",
        hasColor: true,
      });
      const context = contextWith("domains", repo);

      await handlers.update({ input: { slug: "primary", color: "#112233" }, context });
      expect(repo.update).toHaveBeenCalledWith("primary", { color: "#112233" });
    });

    it("skips the repo call entirely when no fields are provided", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue({ ...baseRow, color: "#aabbcc" });
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "domains",
        entityName: "Domain",
        createKey: "domain",
        inUseBy: "one or more cards",
        hasColor: true,
      });

      await handlers.update({ input: { slug: "primary" }, context: contextWith("domains", repo) });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("throws a 404 when the slug does not exist", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(undefined);
      const handlers = createSlugTaxonomyHandlers({
        repoKey: "finishes",
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });

      await expect(
        handlers.update({
          input: { slug: "missing", label: "Renamed" },
          context: contextWith("finishes", repo),
        }),
      ).rejects.toThrow(/not found/u);
    });
  });

  describe("remove", () => {
    const handlersFor = () =>
      createSlugTaxonomyHandlers({
        repoKey: "finishes" as const,
        entityName: "Finish",
        createKey: "finish",
        inUseBy: "one or more printings",
      });

    it("deletes when not well-known and not in use", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(baseRow);
      repo.isInUse.mockResolvedValue(false);
      const handlers = handlersFor();

      await handlers.remove({ input: { slug: "primary" }, context: contextWith("finishes", repo) });
      expect(repo.deleteBySlug).toHaveBeenCalledWith("primary");
    });

    it("throws a 404 when the slug does not exist", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(undefined);
      const handlers = handlersFor();

      await expect(
        handlers.remove({ input: { slug: "missing" }, context: contextWith("finishes", repo) }),
      ).rejects.toThrow(/not found/u);
      expect(repo.deleteBySlug).not.toHaveBeenCalled();
    });

    it("throws a 409 with the lowercased entity name when well-known", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue({ ...baseRow, isWellKnown: true });
      const handlers = handlersFor();

      const promise = handlers.remove({
        input: { slug: "primary" },
        context: contextWith("finishes", repo),
      });
      await expect(promise).rejects.toThrow(/well-known finish/u);
      expect(repo.deleteBySlug).not.toHaveBeenCalled();
    });

    it("throws a 409 naming inUseBy when the row is in use", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(baseRow);
      repo.isInUse.mockResolvedValue(true);
      const handlers = handlersFor();

      const promise = handlers.remove({
        input: { slug: "primary" },
        context: contextWith("finishes", repo),
      });
      await expect(promise).rejects.toThrow(/in use by one or more printings/u);
      expect(repo.deleteBySlug).not.toHaveBeenCalled();
    });

    it("carries the AppError status/code on delete failures", async () => {
      const repo = mockRepo();
      repo.getBySlug.mockResolvedValue(undefined);
      const handlers = handlersFor();

      try {
        await handlers.remove({
          input: { slug: "missing" },
          context: contextWith("finishes", repo),
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).status).toBe(404);
      }
    });
  });
});
