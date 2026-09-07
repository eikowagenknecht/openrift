/**
 * Binary container for the embedding bank, so the catalogue's vectors can be
 * shipped to a browser as one cacheable blob. Vectors are stored as fp16,
 * halving the payload; they decode back to Float32Array.
 */
import type { EmbedBank } from "./embed";

const MAGIC = 0x52_46_45_42; // "RFEB"
export const EMBED_BANK_VERSION = 2;
const VERSION = EMBED_BANK_VERSION;
const FLAG_CANONICAL = 1;

const F32_SCRATCH = new Float32Array(1);
const U32_SCRATCH = new Uint32Array(F32_SCRATCH.buffer);

function toHalf(value: number): number {
  F32_SCRATCH[0] = value;
  const bits = U32_SCRATCH[0];
  const sign = (bits >>> 16) & 0x80_00;
  let exponent = ((bits >>> 23) & 0xff) - 112;
  let mantissa = bits & 0x7f_ff_ff;
  if (exponent <= 0) {
    return sign;
  }
  if (exponent >= 31) {
    return sign | 0x7c_00;
  }
  mantissa += 0x10_00;
  if (mantissa & 0x80_00_00) {
    mantissa = 0;
    exponent++;
    if (exponent >= 31) {
      return sign | 0x7c_00;
    }
  }
  return sign | (exponent << 10) | (mantissa >> 13);
}

function fromHalf(half: number): number {
  const sign = (half & 0x80_00) << 16;
  const exponent = (half >>> 10) & 0x1f;
  if (exponent === 0) {
    return 0;
  }
  if (exponent === 31) {
    return sign ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  }
  U32_SCRATCH[0] = sign | ((exponent + 112) << 23) | ((half & 0x3_ff) << 13);
  return F32_SCRATCH[0];
}

export function encodeEmbedBank(
  bank: EmbedBank,
  artKeyOf: (key: string) => string,
  canonical = false,
): ArrayBuffer {
  const encoder = new TextEncoder();
  const keyBytes = bank.keys.map((key) => encoder.encode(key));
  const artBytes = bank.keys.map((key) => encoder.encode(artKeyOf(key)));

  let size = 4 + 2 + 2 + 4 + 2;
  for (const [i] of bank.keys.entries()) {
    // Lengths are stored as one byte each; a longer key would silently corrupt
    // the container.
    if (keyBytes[i].length > 255 || artBytes[i].length > 255) {
      throw new Error(`embed bank key over 255 bytes: ${bank.keys[i]}`);
    }
    size += 1 + keyBytes[i].length + 1 + artBytes[i].length;
  }
  const dim = bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0;
  if (!Number.isInteger(dim)) {
    throw new TypeError("embed bank vectors are not a whole number of rows");
  }
  size += bank.keys.length * dim * 2;

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setUint32(offset, MAGIC, true);
  offset += 4;
  view.setUint16(offset, VERSION, true);
  offset += 2;
  view.setUint16(offset, dim, true);
  offset += 2;
  view.setUint32(offset, bank.keys.length, true);
  offset += 4;
  view.setUint16(offset, canonical ? FLAG_CANONICAL : 0, true);
  offset += 2;

  for (const [i] of bank.keys.entries()) {
    view.setUint8(offset, keyBytes[i].length);
    offset += 1;
    bytes.set(keyBytes[i], offset);
    offset += keyBytes[i].length;
    view.setUint8(offset, artBytes[i].length);
    offset += 1;
    bytes.set(artBytes[i], offset);
    offset += artBytes[i].length;
  }

  for (let i = 0; i < bank.keys.length * dim; i++) {
    view.setUint16(offset, toHalf(bank.vectors[i]), true);
    offset += 2;
  }

  return buffer;
}

export function decodeEmbedBank(buffer: ArrayBuffer): {
  bank: EmbedBank;
  artKeys: Map<string, string>;
  canonical: boolean;
} {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let offset = 0;

  if (view.getUint32(offset, true) !== MAGIC) {
    throw new Error("not an embedding bank");
  }
  offset += 4;
  const version = view.getUint16(offset, true);
  if (version !== 1 && version !== VERSION) {
    throw new Error(`unsupported embedding bank version ${version}`);
  }
  offset += 2;
  const dim = view.getUint16(offset, true);
  if (dim === 0) {
    throw new Error("embedding bank has zero dimension");
  }
  offset += 2;
  const count = view.getUint32(offset, true);
  offset += 4;
  let canonical = false;
  if (version >= 2) {
    canonical = (view.getUint16(offset, true) & FLAG_CANONICAL) !== 0;
    offset += 2;
  }

  const keys: string[] = [];
  const artKeys = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const keyLength = view.getUint8(offset);
    offset += 1;
    const key = decoder.decode(new Uint8Array(buffer, offset, keyLength));
    offset += keyLength;
    const artLength = view.getUint8(offset);
    offset += 1;
    const artKey = decoder.decode(new Uint8Array(buffer, offset, artLength));
    offset += artLength;
    keys.push(key);
    artKeys.set(key, artKey);
  }

  const vectors = new Float32Array(count * dim);
  for (let i = 0; i < vectors.length; i++) {
    vectors[i] = fromHalf(view.getUint16(offset, true));
    offset += 2;
  }

  return { bank: { keys, vectors }, artKeys, canonical };
}
