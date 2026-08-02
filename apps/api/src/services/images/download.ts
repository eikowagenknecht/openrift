// oxlint-disable-next-line import/no-nodejs-modules -- SSRF guard needs IP literal detection
import { isIP } from "node:net";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { extname } from "node:path";

import type { Io } from "../../io.js";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

function guessExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("png")) {
    return ".png";
  }
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
    return ".jpg";
  }
  if (contentType?.includes("webp")) {
    return ".webp";
  }
  if (contentType?.includes("avif")) {
    return ".avif";
  }
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ext || ".png";
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && (b === 168 || b === 0)) || // private + IETF reserved
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
    a >= 224 // multicast, reserved, broadcast
  );
}

/**
 * Whether an IP literal points at a non-public network: loopback, RFC-1918,
 * link-local (cloud metadata), CGNAT, ULA, multicast, or unspecified.
 * @returns True when the address must not be fetched server-side.
 */
export function isPrivateIp(ip: string): boolean {
  const bare = ip.includes("%") ? ip.slice(0, ip.indexOf("%")) : ip;
  if (isIP(bare) === 4) {
    return isPrivateIpv4(bare);
  }
  const lower = bare.toLowerCase();
  if (lower === "::" || lower === "::1") {
    return true;
  }
  // IPv4-mapped IPv6 in dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1) form.
  const mappedDotted = /^::ffff:(?<v4>\d+\.\d+\.\d+\.\d+)$/u.exec(lower);
  if (mappedDotted?.groups?.v4) {
    return isPrivateIpv4(mappedDotted.groups.v4);
  }
  const mappedHex = /^::ffff:(?<hi>[0-9a-f]{1,4}):(?<lo>[0-9a-f]{1,4})$/u.exec(lower);
  if (mappedHex?.groups) {
    const hi = Number.parseInt(mappedHex.groups.hi, 16);
    const lo = Number.parseInt(mappedHex.groups.lo, 16);
    return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  return (
    lower.startsWith("fc") || // ULA fc00::/7
    lower.startsWith("fd") ||
    /^fe[89ab]/u.test(lower) || // link-local fe80::/10
    lower.startsWith("ff") // multicast
  );
}

/**
 * Rejects URLs the server must never fetch: non-http(s) schemes, and hosts
 * that resolve to loopback / private / link-local addresses. Image source
 * URLs are user-supplied (in-app card contributions, ADR-036), so without
 * this every admin "accept" would let a submitter aim the server's fetch at
 * internal services. DNS is checked post-resolution; the subsequent fetch
 * re-resolves, so an attacker rotating DNS between the check and the fetch
 * (rebinding) is out of scope — this guards against direct internal targets.
 */
async function assertPublicImageUrl(io: Io, url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Blocked download (unsupported protocol ${parsed.protocol}): ${url}`);
  }
  const host = parsed.hostname.replaceAll(/^\[|\]$/gu, "");
  let addresses = [host];
  if (isIP(host) === 0) {
    const resolved = await io.dnsLookupAll(host);
    addresses = resolved.map((entry) => entry.address);
  }
  if (addresses.length === 0) {
    throw new Error(`Blocked download (host did not resolve): ${url}`);
  }
  for (const address of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`Blocked download (private address): ${url}`);
    }
  }
}

export async function downloadImage(io: Io, url: string): Promise<{ buffer: Buffer; ext: string }> {
  // Redirects are followed manually so every hop gets the SSRF check — a
  // public URL redirecting to an internal address must be blocked too.
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicImageUrl(io, current);
    const { origin } = new URL(current);
    const res = await io.fetch(current, {
      headers: { Referer: `${origin}/` },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Download failed (redirect without location): ${url}`);
      }
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) {
      throw new Error(`Download failed (${res.status}): ${url}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = guessExtension(res.headers.get("content-type"), current);
    return { buffer, ext };
  }
  throw new Error(`Download failed (too many redirects): ${url}`);
}
