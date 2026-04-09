import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import {
  imageUrl,
  imageUrlWithOriginal,
  resolveCardId,
  selectCopyWithCard,
} from "./query-helpers.js";

describe("resolveCardId", () => {
  it("returns a raw builder expression", () => {
    const result = resolveCardId("cs");
    expect(result).toBeDefined();
  });
});

describe("imageUrl", () => {
  it("returns a raw builder expression", () => {
    const result = imageUrl("pi");
    expect(result).toBeDefined();
  });
});

describe("imageUrlWithOriginal", () => {
  it("returns a raw builder expression", () => {
    const result = imageUrlWithOriginal("pi");
    expect(result).toBeDefined();
  });
});

describe("selectCopyWithCard", () => {
  it("returns a query builder with joins", () => {
    const db = createMockDb();
    const builder = selectCopyWithCard(db);
    expect(builder).toBeDefined();
  });
});
