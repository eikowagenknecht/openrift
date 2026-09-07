import { describe, expect, it } from "vitest";

import { CARD_CALM_UNIT, CARD_FURY_UNIT } from "../../../test/fixtures/constants.js";
import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const ctx = createTestContext("a0000000-0008-4000-a000-000000000001");

describe.skipIf(!ctx)("Decks routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let deckId: string;
  // Created alongside the others so the DELETE cases have a deck they can
  // consume without disturbing the ones later tests still read.
  let disposableDeckId: string;

  describe("POST /decks", () => {
    it("creates a standard deck", async () => {
      const res = await app.fetch(
        req("POST", "/decks", { name: "My Deck", format: "constructed" }),
      );
      expect(res.status).toBe(201);

      const json = await readJson(res);
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("My Deck");
      expect(json.format).toBe("constructed");
      expect(json.isPublic).toBe(false);
      deckId = json.id;
    });

    it("creates a freeform deck", async () => {
      const res = await app.fetch(
        req("POST", "/decks", { name: "Freeform Deck", format: "freeform" }),
      );
      expect(res.status).toBe(201);

      const json = await readJson(res);
      expect(json.format).toBe("freeform");
    });

    it("creates a deck with a description", async () => {
      const res = await app.fetch(
        req("POST", "/decks", { name: "Third Deck", format: "constructed", description: "Notes" }),
      );
      expect(res.status).toBe(201);

      const json = await readJson(res);
      expect(json.description).toBe("Notes");
      disposableDeckId = json.id;
    });

    it("rejects creation without name", async () => {
      const res = await app.fetch(req("POST", "/decks", { format: "constructed" }));
      expect(res.status).toBe(400);
    });

    it("rejects creation without format", async () => {
      const res = await app.fetch(req("POST", "/decks", { name: "No Format" }));
      expect(res.status).toBe(400);
    });

    it("rejects invalid format", async () => {
      const res = await app.fetch(req("POST", "/decks", { name: "Bad Format", format: "invalid" }));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /decks", () => {
    it("returns all decks for the user", async () => {
      const res = await app.fetch(req("GET", "/decks"));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { items: unknown[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBe(3);
    });
  });

  describe("GET /decks/:id", () => {
    it("returns deck with nested deck + cards structure", async () => {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.deck.id).toBe(deckId);
      expect(json.deck.name).toBe("My Deck");
      expect(json.deck.format).toBe("constructed");
      expect(json.cards).toBeDefined();
      expect(json.cards).toHaveLength(0);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/decks/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /decks/:id", () => {
    it("updates deck name", async () => {
      const res = await app.fetch(req("PATCH", `/decks/${deckId}`, { name: "Renamed Deck" }));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.name).toBe("Renamed Deck");
    });

    it("updates deck description", async () => {
      const res = await app.fetch(
        req("PATCH", `/decks/${deckId}`, { description: "A great deck" }),
      );
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.description).toBe("A great deck");
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/decks/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /decks/:id/cards", () => {
    it("sets cards for a standard deck (>=40 main)", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 20 },
            { cardId: CARD_CALM_UNIT.id, zone: "main", quantity: 20 },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const json = (await readJson(res)) as { cards: unknown[] };
      expect(Array.isArray(json.cards)).toBe(true);
    });

    it("verifies cards were saved via GET", async () => {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = await readJson(res);
      expect(json.cards.length).toBe(2);
      // No denormalized cardName here; that lives on the public deck-share shape.
      expect(json.cards[0].cardId).toBeTypeOf("string");
      expect(json.cards[0].zone).toBe("main");
    });

    // Deck-size rules are advisory: PUT /cards saves any composition, and
    // validation surfaces only as the `isValid` flag on GET /decks.
    async function isDeckValid(): Promise<boolean> {
      const listRes = await app.fetch(req("GET", "/decks"));
      const list = (await readJson(listRes)) as {
        items: { deck: { id: string }; isValid: boolean }[];
      };
      const entry = list.items.find((item) => item.deck.id === deckId);
      expect(entry).toBeDefined();
      return (entry as NonNullable<typeof entry>).isValid;
    }

    it("saves a constructed deck with fewer than 40 main cards but reports it invalid", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 10 }],
        }),
      );
      expect(res.status).toBe(200);
      expect(await isDeckValid()).toBe(false);
    });

    it("saves a constructed deck with more than 8 sideboard cards but reports it invalid", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 },
            { cardId: CARD_CALM_UNIT.id, zone: "sideboard", quantity: 9 },
          ],
        }),
      );
      expect(res.status).toBe(200);
      expect(await isDeckValid()).toBe(false);
    });

    it("replaces all cards on subsequent PUT", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { cards: unknown[] };
      expect(json.cards.length).toBe(1);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PUT", `/decks/${fakeId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /decks/:id", () => {
    it("deletes a deck", async () => {
      const res = await app.fetch(req("DELETE", `/decks/${disposableDeckId}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/decks/${disposableDeckId}`));
      expect(res.status).toBe(404);
    });

    it("returns 404 when deleting non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/decks/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  describe("Share deck flow", () => {
    let shareDeckId: string;
    let shareToken: string;

    it("creates a deck to share", async () => {
      const res = await app.fetch(
        req("POST", "/decks", {
          name: "Shareable",
          format: "freeform",
          description: "A friendly deck",
        }),
      );
      expect(res.status).toBe(201);
      const json = await readJson(res);
      shareDeckId = json.id;
      expect(json.isPublic).toBe(false);
      expect(json.shareToken).toBeNull();
    });

    it("reports an unshared deck as { shareToken: null, isPublic: false } on GET /decks/:id/share", async () => {
      const res = await app.fetch(req("GET", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.shareToken).toBeNull();
      expect(json.isPublic).toBe(false);
    });

    it("generates a share token on POST /decks/:id/share", async () => {
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
      shareToken = json.shareToken;
    });

    it("reflects the shared state on GET /decks/:id/share", async () => {
      const res = await app.fetch(req("GET", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toBe(shareToken);
    });

    it("is idempotent: re-sharing returns the same token", async () => {
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toBe(shareToken);

      const stillResolves = await app.fetch(req("GET", `/decks/share/${shareToken}`));
      expect(stillResolves.status).toBe(200);
    });

    it("rotates the token on POST /decks/:id/share/rotate; old token stops resolving", async () => {
      const oldToken = shareToken;
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share/rotate`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
      expect(json.shareToken).not.toBe(oldToken);

      const oldTokenGet = await app.fetch(req("GET", `/decks/share/${oldToken}`));
      expect(oldTokenGet.status).toBe(404);
      const newTokenGet = await app.fetch(req("GET", `/decks/share/${json.shareToken}`));
      expect(newTokenGet.status).toBe(200);

      shareToken = json.shareToken;
    });

    it("reflects isPublic=true and shareToken on GET /decks/:id", async () => {
      const res = await app.fetch(req("GET", `/decks/${shareDeckId}`));
      const json = await readJson(res);
      expect(json.deck.isPublic).toBe(true);
      expect(json.deck.shareToken).toBe(shareToken);
    });

    it("returns the deck to anonymous callers via GET /decks/share/:token", async () => {
      const res = await app.fetch(req("GET", `/decks/share/${shareToken}`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.deck.id).toBe(shareDeckId);
      expect(json.deck.name).toBe("Shareable");
      expect(json.deck.description).toBe("A friendly deck");
      expect(json.owner.displayName).toBeTypeOf("string");
      expect(json.deck).not.toHaveProperty("shareToken");
      expect(json.deck).not.toHaveProperty("isPublic");
    });

    it("clones the shared deck as a second user via POST /decks/share/:token/clone", () => {
      const otherUser = createTestContext("a0000000-0008-4000-a000-000000000002");
      if (!otherUser) {
        return;
      }
      return (async () => {
        const res = await otherUser.app.fetch(req("POST", `/decks/share/${shareToken}/clone`));
        expect(res.status).toBe(201);
        const json = await readJson(res);
        expect(json.deckId).toBeTypeOf("string");
        expect(json.deckId).not.toBe(shareDeckId);

        const detail = await otherUser.app.fetch(req("GET", `/decks/${json.deckId}`));
        expect(detail.status).toBe(200);
        const detailJson = await readJson(detail);
        expect(detailJson.deck.name).toBe("Copy of Shareable");
        expect(detailJson.deck.isPublic).toBe(false);
      })();
    });

    it("404s the share URL after DELETE /decks/:id/share", async () => {
      const del = await app.fetch(req("DELETE", `/decks/${shareDeckId}/share`));
      expect(del.status).toBe(204);

      const get = await app.fetch(req("GET", `/decks/share/${shareToken}`));
      expect(get.status).toBe(404);

      const state = await app.fetch(req("GET", `/decks/${shareDeckId}/share`));
      expect(state.status).toBe(200);
      const stateJson = await readJson(state);
      expect(stateJson.shareToken).toBeNull();
      expect(stateJson.isPublic).toBe(false);
    });

    it("re-sharing after an unshare mints a fresh token; the deleted token stays dead", async () => {
      const deadToken = shareToken;
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).not.toBe(deadToken);

      const deadTokenGet = await app.fetch(req("GET", `/decks/share/${deadToken}`));
      expect(deadTokenGet.status).toBe(404);

      const newTokenGet = await app.fetch(req("GET", `/decks/share/${json.shareToken}`));
      expect(newTokenGet.status).toBe(200);
    });

    it("404s get-share/share/rotate/unshare/clone for non-existent decks or tokens", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const getShareRes = await app.fetch(req("GET", `/decks/${fakeId}/share`));
      expect(getShareRes.status).toBe(404);

      const shareRes = await app.fetch(req("POST", `/decks/${fakeId}/share`));
      expect(shareRes.status).toBe(404);

      const rotateRes = await app.fetch(req("POST", `/decks/${fakeId}/share/rotate`));
      expect(rotateRes.status).toBe(404);

      const unshareRes = await app.fetch(req("DELETE", `/decks/${fakeId}/share`));
      expect(unshareRes.status).toBe(404);

      const cloneRes = await app.fetch(req("POST", "/decks/share/nonexistent-token/clone"));
      expect(cloneRes.status).toBe(404);
    });
  });

  describe("Deck variants", () => {
    const fakeId = "00000000-0000-4000-a000-000000000000";
    let liveDeckId: string;
    let firstVariantId: string;
    let variantId: string;

    it("creates a standalone deck with the variant fields at their defaults", async () => {
      const res = await app.fetch(
        req("POST", "/decks", { name: "Versioned", format: "constructed" }),
      );
      expect(res.status).toBe(201);
      const json = await readJson(res);
      expect(json.familyId).toBeNull();
      expect(json.predecessorDeckId).toBeNull();
      expect(json.isPrimary).toBe(false);
      expect(json.isDraft).toBe(false);
      liveDeckId = json.id;
    });

    it("copies the deck: 201, named after the source, family created", async () => {
      const res = await app.fetch(req("POST", `/decks/${liveDeckId}/variants`, {}));
      expect(res.status).toBe(201);
      const json = await readJson(res);
      expect(json.id).not.toBe(liveDeckId);
      expect(json.name).toBe("Versioned (variant)");
      expect(json.familyId).toBeTypeOf("string");
      expect(json.predecessorDeckId).toBe(liveDeckId);
      expect(json.isPrimary).toBe(false);
      expect(json.isPublic).toBe(false);
      firstVariantId = json.id;

      const live = await readJson(await app.fetch(req("GET", `/decks/${liveDeckId}`)));
      expect(live.deck.familyId).toBe(json.familyId);
      expect(live.deck.isPrimary).toBe(true);
      expect(live.deck.predecessorDeckId).toBeNull();
    });

    it("creates a sibling variant with an explicit name", async () => {
      const res = await app.fetch(
        req("POST", `/decks/${liveDeckId}/variants`, { name: "Budget build" }),
      );
      expect(res.status).toBe(201);
      const json = await readJson(res);
      expect(json.name).toBe("Budget build");
      expect(json.predecessorDeckId).toBe(liveDeckId);
      expect(json.isPrimary).toBe(false);
      variantId = json.id;

      const live = await readJson(await app.fetch(req("GET", `/decks/${liveDeckId}`)));
      expect(json.familyId).toBe(live.deck.familyId);
    });

    it("rejects a variant request with an empty name", async () => {
      const res = await app.fetch(req("POST", `/decks/${liveDeckId}/variants`, { name: "" }));
      expect(res.status).toBe(400);
    });

    it("404s POST /decks/:id/variants for a non-existent deck", async () => {
      const res = await app.fetch(req("POST", `/decks/${fakeId}/variants`, {}));
      expect(res.status).toBe(404);
    });

    it("promotes a variant to primary and demotes the previous one", async () => {
      const res = await app.fetch(req("POST", `/decks/${variantId}/promote`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.id).toBe(variantId);
      expect(json.isPrimary).toBe(true);

      const live = await readJson(await app.fetch(req("GET", `/decks/${liveDeckId}`)));
      expect(live.deck.isPrimary).toBe(false);
      const sibling = await readJson(await app.fetch(req("GET", `/decks/${firstVariantId}`)));
      expect(sibling.deck.isPrimary).toBe(false);
    });

    it("400s promote for a deck that has no variants", async () => {
      const created = await readJson(
        await app.fetch(req("POST", "/decks", { name: "Standalone", format: "freeform" })),
      );
      const res = await app.fetch(req("POST", `/decks/${created.id}/promote`));
      expect(res.status).toBe(400);
    });

    it("404s promote for a non-existent deck", async () => {
      const res = await app.fetch(req("POST", `/decks/${fakeId}/promote`));
      expect(res.status).toBe(404);
    });

    it("links an existing deck into the family and unlinks it again", async () => {
      const outsider = await readJson(
        await app.fetch(req("POST", "/decks", { name: "Outsider", format: "freeform" })),
      );

      const linkRes = await app.fetch(
        req("POST", `/decks/${outsider.id}/link`, {
          otherDeckId: liveDeckId,
          markAsPreviousVersion: true,
        }),
      );
      expect(linkRes.status).toBe(200);
      const linked = await readJson(linkRes);
      const live = await readJson(await app.fetch(req("GET", `/decks/${liveDeckId}`)));
      expect(linked.familyId).toBe(live.deck.familyId);
      expect(linked.predecessorDeckId).toBe(liveDeckId);
      // The family already had a primary (the promoted variant), so it stays.
      expect(linked.isPrimary).toBe(false);

      const unlinkRes = await app.fetch(req("POST", `/decks/${outsider.id}/unlink`));
      expect(unlinkRes.status).toBe(200);
      const unlinked = await readJson(unlinkRes);
      expect(unlinked.familyId).toBeNull();
      expect(unlinked.isPrimary).toBe(false);
      expect(unlinked.predecessorDeckId).toBeNull();
    });

    it("400s link for a deck linked to itself", async () => {
      const res = await app.fetch(
        req("POST", `/decks/${liveDeckId}/link`, { otherDeckId: liveDeckId }),
      );
      expect(res.status).toBe(400);
    });

    it("400s unlink for a deck that has no variants", async () => {
      const created = await readJson(
        await app.fetch(req("POST", "/decks", { name: "Unlinkable", format: "freeform" })),
      );
      const res = await app.fetch(req("POST", `/decks/${created.id}/unlink`));
      expect(res.status).toBe(400);
    });

    it("404s link and unlink for a non-existent deck", async () => {
      const linkRes = await app.fetch(
        req("POST", `/decks/${fakeId}/link`, { otherDeckId: liveDeckId }),
      );
      expect(linkRes.status).toBe(404);
      const unlinkRes = await app.fetch(req("POST", `/decks/${fakeId}/unlink`));
      expect(unlinkRes.status).toBe(404);
    });

    it("404s variants and promote for another user's deck", () => {
      const otherUser = createTestContext("a0000000-0008-4000-a000-000000000002");
      if (!otherUser) {
        return;
      }
      return (async () => {
        const theirs = await readJson(
          await otherUser.app.fetch(req("POST", "/decks", { name: "Theirs", format: "freeform" })),
        );
        await otherUser.app.fetch(req("POST", `/decks/${theirs.id}/variants`, {}));

        const variantRes = await app.fetch(req("POST", `/decks/${theirs.id}/variants`, {}));
        expect(variantRes.status).toBe(404);
        const promoteRes = await app.fetch(req("POST", `/decks/${theirs.id}/promote`));
        expect(promoteRes.status).toBe(404);
        const linkRes = await app.fetch(
          req("POST", `/decks/${theirs.id}/link`, { otherDeckId: liveDeckId }),
        );
        expect(linkRes.status).toBe(404);
        const linkOtherRes = await app.fetch(
          req("POST", `/decks/${liveDeckId}/link`, { otherDeckId: theirs.id }),
        );
        expect(linkOtherRes.status).toBe(404);
        const unlinkRes = await app.fetch(req("POST", `/decks/${theirs.id}/unlink`));
        expect(unlinkRes.status).toBe(404);
      })();
    });

    it("toggles the draft badge via PATCH /decks/:id", async () => {
      const on = await app.fetch(req("PATCH", `/decks/${variantId}`, { isDraft: true }));
      expect(on.status).toBe(200);
      const onJson = await readJson(on);
      expect(onJson.isDraft).toBe(true);

      const detailRes = await app.fetch(req("GET", `/decks/${variantId}`));
      const detail = await readJson(detailRes);
      expect(detail.deck.isDraft).toBe(true);

      const off = await app.fetch(req("PATCH", `/decks/${variantId}`, { isDraft: false }));
      expect(off.status).toBe(200);
      const offJson = await readJson(off);
      expect(offJson.isDraft).toBe(false);
    });
  });
});
