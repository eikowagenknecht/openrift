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

export interface Io {
  fs: Fs;
  fetch: Fetch;
  sharp: Sharp;
}

export const defaultIo: Io = {
  fs: { mkdir, readFile, readdir, rename, stat, unlink, writeFile },
  fetch: globalThis.fetch,
  sharp,
};
