import { describe, expect, it } from "vitest";

import type { EmbedBank } from "./embed";
import { EMBED_DIM } from "./embed";
import { decodeEmbedBank, encodeEmbedBank } from "./embed-format";

/**
 * Build a deterministic pseudo-random unit vector.
 *
 * @returns The normalized vector.
 */
function unitVector(seed: number): Float32Array {
  const vector = new Float32Array(EMBED_DIM);
  let value = seed;
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648;
    vector[i] = value / 2_147_483_648 - 0.5;
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < EMBED_DIM; i++) {
    vector[i] /= norm;
  }
  return vector;
}

describe("embed bank round trip", () => {
  const bank: EmbedBank = {
    keys: ["key-a", "key-b", "key-c"],
    vectors: (() => {
      const vectors = new Float32Array(3 * EMBED_DIM);
      for (let i = 0; i < 3; i++) {
        vectors.set(unitVector(i + 1), i * EMBED_DIM);
      }
      return vectors;
    })(),
  };
  const artKeyOf = (key: string) => `art-${key}`;

  it("restores keys and artwork grouping", () => {
    const { bank: decoded, artKeys } = decodeEmbedBank(encodeEmbedBank(bank, artKeyOf));
    expect(decoded.keys).toEqual(bank.keys);
    expect(artKeys.get("key-b")).toBe("art-key-b");
  });

  it("keeps cosines within fp16 tolerance", () => {
    const { bank: decoded } = decodeEmbedBank(encodeEmbedBank(bank, artKeyOf));
    for (let entry = 0; entry < bank.keys.length; entry++) {
      let cosine = 0;
      for (let i = 0; i < EMBED_DIM; i++) {
        cosine += bank.vectors[entry * EMBED_DIM + i] * decoded.vectors[entry * EMBED_DIM + i];
      }
      // fp16 costs a few 1e-5 of cosine; pipeline margins live at 5e-2 and up.
      expect(cosine).toBeGreaterThan(0.9999);
    }
  });

  it("rejects foreign buffers", () => {
    expect(() => decodeEmbedBank(new ArrayBuffer(16))).toThrow("not an embedding bank");
  });

  it("round-trips the canonical flag", () => {
    expect(decodeEmbedBank(encodeEmbedBank(bank, artKeyOf)).canonical).toBe(false);
    expect(decodeEmbedBank(encodeEmbedBank(bank, artKeyOf, true)).canonical).toBe(true);
  });

  it("still decodes version-1 banks as native orientation", () => {
    // A version-2 buffer with the version field patched down and the flags
    // word cut out is exactly the version-1 layout.
    const v2 = encodeEmbedBank(bank, artKeyOf, true);
    const v1 = new Uint8Array(v2.byteLength - 2);
    v1.set(new Uint8Array(v2, 0, 12), 0);
    v1.set(new Uint8Array(v2, 14), 12);
    new DataView(v1.buffer).setUint16(4, 1, true);

    const decoded = decodeEmbedBank(v1.buffer);
    expect(decoded.canonical).toBe(false);
    expect(decoded.bank.keys).toEqual(bank.keys);
    expect(decoded.artKeys.get("key-b")).toBe("art-key-b");
  });
});
