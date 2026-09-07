import { describe, expect, it } from "vitest";

import { suggestListIdForProduct } from "./suggest-product-list";

function list(id: string, name: string, kind = "printing") {
  return { id, name, kind };
}

describe("suggestListIdForProduct", () => {
  it("matches a printing list whose name slugifies to the product slug", () => {
    const lists = [list("a", "Origins Starter Set"), list("b", "Some Other List")];
    const product = { name: "Origins Starter Set", slug: "origins-starter-set" };
    expect(suggestListIdForProduct(lists, product)).toBe("a");
  });

  it("falls back to a case-insensitive name match when the slug was edited", () => {
    const lists = [list("a", "Origins Starter Set")];
    const product = { name: "origins starter set  ", slug: "custom-slug" };
    expect(suggestListIdForProduct(lists, product)).toBe("a");
  });

  it("ignores non-printing lists even when the name matches", () => {
    const lists = [
      list("card", "Origins Starter Set", "card"),
      list("copy", "Origins Starter Set", "copy"),
    ];
    const product = { name: "Origins Starter Set", slug: "origins-starter-set" };
    expect(suggestListIdForProduct(lists, product)).toBeNull();
  });

  it("returns null when nothing looks like the product", () => {
    const lists = [list("a", "Unrelated List")];
    const product = { name: "Origins Starter Set", slug: "origins-starter-set" };
    expect(suggestListIdForProduct(lists, product)).toBeNull();
  });

  it("returns the first match when several printing lists qualify", () => {
    const lists = [list("first", "Origins Starter Set"), list("second", "Origins Starter Set")];
    const product = { name: "Origins Starter Set", slug: "origins-starter-set" };
    expect(suggestListIdForProduct(lists, product)).toBe("first");
  });
});
