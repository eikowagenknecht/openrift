// oxlint-disable-next-line import/no-nodejs-modules -- infrastructure layer wraps Node builtins for DI
import { lookup } from "node:dns/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- infrastructure layer wraps Node builtins for DI
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";

import sharp from "sharp";

interface Fs {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  readdir: typeof readdir;
  rename: typeof rename;
  stat: typeof stat;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
}

export type Fetch = typeof globalThis.fetch;

type Sharp = typeof sharp;

/** Resolve a hostname to every address it maps to (for SSRF checks). */
type DnsLookupAll = (hostname: string) => Promise<{ address: string }[]>;

export interface Io {
  fs: Fs;
  fetch: Fetch;
  sharp: Sharp;
  dnsLookupAll: DnsLookupAll;
}

export const defaultIo: Io = {
  fs: { mkdir, readFile, readdir, rename, stat, unlink, writeFile },
  fetch: globalThis.fetch,
  sharp,
  dnsLookupAll: (hostname) => lookup(hostname, { all: true }),
};
