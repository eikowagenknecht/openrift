/**
 * Binary container for the embedding bank, so the catalogue's vectors can be
 * shipped to a browser as one cacheable blob.
 *
 * Vectors are stored as fp16, which halves the payload; they decode back to
 * Float32Array so ranking code is unaffected. Unit-vector components sit well
 * inside fp16's range, and the round-trip moves cosines by less than 1e-3,
 * far below any decision threshold in the pipeline. Each entry also carries
 * its artwork key, because the accept layer aggregates by artwork and the
 * browser should not need a second download to know the grouping.
 */
import type { EmbedBank } from "./embed";
import { EMBED_DIM } from "./embed";

const MAGIC = 0x52_46_45_42; // "RFEB"
const VERSION = 1;

const F32_SCRATCH = new Float32Array(1);
const U32_SCRATCH = new Uint32Array(F32_SCRATCH.buffer);

/**
 * Convert one float to fp16 bits, round to nearest.
 *
 * @returns The 16-bit pattern; denormals flush to signed zero.
 */
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

/**
 * Convert fp16 bits back to a float.
 *
 * @returns The value; flushed denormals come back as zero.
 */
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

/**
 * Serialise a bank with its artwork grouping.
 *
 * @returns A self-contained buffer that {@link decodeEmbedBank} can restore.
 */
export function encodeEmbedBank(bank: EmbedBank, artKeyOf: (key: string) => string): ArrayBuffer {
  const encoder = new TextEncoder();
  const keyBytes = bank.keys.map((key) => encoder.encode(key));
  const artBytes = bank.keys.map((key) => encoder.encode(artKeyOf(key)));

  let size = 4 + 2 + 2 + 4;
  for (const [i] of bank.keys.entries()) {
    // Lengths are stored as one byte each; a longer key would silently corrupt
    // the container.
    if (keyBytes[i].length > 255 || artBytes[i].length > 255) {
      throw new Error(`embed bank key over 255 bytes: ${bank.keys[i]}`);
    }
    size += 1 + keyBytes[i].length + 1 + artBytes[i].length;
  }
  size += bank.keys.length * EMBED_DIM * 2;

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setUint32(offset, MAGIC, true);
  offset += 4;
  view.setUint16(offset, VERSION, true);
  offset += 2;
  view.setUint16(offset, EMBED_DIM, true);
  offset += 2;
  view.setUint32(offset, bank.keys.length, true);
  offset += 4;

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

  for (let i = 0; i < bank.keys.length * EMBED_DIM; i++) {
    view.setUint16(offset, toHalf(bank.vectors[i]), true);
    offset += 2;
  }

  return buffer;
}

/**
 * Restore a serialised bank.
 *
 * @returns The bank with Float32 vectors, plus each key's artwork key.
 */
export function decodeEmbedBank(buffer: ArrayBuffer): {
  bank: EmbedBank;
  artKeys: Map<string, string>;
} {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let offset = 0;

  if (view.getUint32(offset, true) !== MAGIC) {
    throw new Error("not an embedding bank");
  }
  offset += 4;
  const version = view.getUint16(offset, true);
  if (version !== VERSION) {
    throw new Error(`unsupported embedding bank version ${version}`);
  }
  offset += 2;
  const dim = view.getUint16(offset, true);
  if (dim !== EMBED_DIM) {
    throw new Error(`unexpected embedding dimension ${dim}`);
  }
  offset += 2;
  const count = view.getUint32(offset, true);
  offset += 4;

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

  const vectors = new Float32Array(count * EMBED_DIM);
  for (let i = 0; i < vectors.length; i++) {
    vectors[i] = fromHalf(view.getUint16(offset, true));
    offset += 2;
  }

  return { bank: { keys, vectors }, artKeys };
}
