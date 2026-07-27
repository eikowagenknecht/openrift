/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/**
 * Map reference image keys onto human-readable card identities.
 *
 * The bench needs this to tell a real failure from a near miss. The catalogue
 * carries the same artwork in several languages and finishes, so returning the
 * Simplified Chinese print of the card the user is holding is a very different
 * kind of wrong from returning an unrelated card, and the two need separate
 * numbers before any tuning decision can be trusted.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "./lib";

export interface CardIdentity {
  /** image_files.id */
  key: string;
  name: string;
  setSlug: string;
  publicCode: string;
  language: string;
  /** cards.type — selects the measured text band for printing disambiguation. */
  cardType: string;
  /** Distinct artwork identity: same value means the images should look alike. */
  artKey: string;
}

const CACHE_FILE = path.join(DATA_DIR, "cache", "catalog.json");

const QUERY = `
  select pi.image_file_id as key,
         c.name as name,
         s.slug as set_slug,
         p.public_code as public_code,
         p.language as language,
         c.type as card_type,
         p.art_variant as art_variant
  from printing_images pi
  join printings p on p.id = pi.printing_id
  join cards c on c.id = p.card_id
  join sets s on s.id = p.set_id
  where pi.face = 'front'
`;

/**
 * Load the key-to-identity map, querying the dev database once and caching it.
 *
 * @returns A map from image file id to card identity.
 */
export function loadCatalog(refresh = false): Map<string, CardIdentity> {
  if (!refresh && fs.existsSync(CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as CardIdentity[];
    // A cache written before cardType existed refreshes itself once.
    if (cached.length === 0 || cached[0].cardType !== undefined) {
      return new Map(cached.map((c) => [c.key, c]));
    }
  }

  const raw = execFileSync(
    "docker",
    ["exec", "openrift-db-1", "psql", "-U", "openrift", "-t", "-A", "-F", "", "-c", QUERY],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );

  const identities: CardIdentity[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const parts = line.split("");
    if (parts.length < 7) {
      continue;
    }
    const [key, name, setSlug, publicCode, language, cardType, artVariant] = parts;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    identities.push({
      key,
      name,
      setSlug,
      publicCode,
      language,
      cardType,
      // Language is deliberately excluded: two prints of one artwork differ only
      // in their text, which is what makes them hard to separate visually.
      artKey: `${setSlug}|${name}|${artVariant}`,
    });
  }

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(identities, null, 2)}\n`);
  return new Map(identities.map((c) => [c.key, c]));
}

/**
 * Describe a key for bench output.
 *
 * @returns A short human-readable label.
 */
export function describe(catalog: Map<string, CardIdentity>, key: string | null): string {
  if (!key) {
    return "none";
  }
  const identity = catalog.get(key);
  return identity
    ? `${identity.name} [${identity.publicCode} ${identity.language}]`
    : `unknown:${key.slice(0, 8)}`;
}
