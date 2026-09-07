/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/**
 * Map reference image keys onto human-readable card identities, so the bench
 * can tell a wrong-language print of the right card from a wrong card.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "./lib";

export interface CardIdentity {
  key: string;
  name: string;
  setSlug: string;
  publicCode: string;
  language: string;
  cardType: string;
  /** "promo", "judge+promo", "" for none; null when printings sharing this image disagree on markers. */
  markers: string | null;
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
         p.art_variant as art_variant,
         p.is_overnumbered as is_overnumbered,
         array_to_string(p.marker_slugs, '+') as markers
  from printing_images pi
  join printings p on p.id = pi.printing_id
  join cards c on c.id = p.card_id
  join sets s on s.id = p.set_id
  where pi.face = 'front'
`;

export function loadCatalog(refresh = false): Map<string, CardIdentity> {
  if (!refresh && fs.existsSync(CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as CardIdentity[];
    // A cache written before cardType, markers or the overnumbered segment of
    // artKey existed refreshes itself once (checked by field count, not value).
    const first = cached[0];
    const fresh =
      first === undefined ||
      (first.cardType !== undefined && "markers" in first && first.artKey.split("|").length === 4);
    if (fresh) {
      return new Map(cached.map((c) => [c.key, c]));
    }
  }

  const raw = execFileSync(
    "docker",
    ["exec", "openrift-db-1", "psql", "-U", "openrift", "-t", "-A", "-F", "", "-c", QUERY],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );

  const identities: CardIdentity[] = [];
  const byKey = new Map<string, CardIdentity>();
  for (const line of raw.split("\n")) {
    const parts = line.split("");
    if (parts.length < 9) {
      continue;
    }
    const [
      key,
      name,
      setSlug,
      publicCode,
      language,
      cardType,
      artVariant,
      isOvernumbered,
      markers,
    ] = parts;
    const existing = byKey.get(key);
    if (existing) {
      // One image can serve several printings. The first row stays the
      // identity, but a marker disagreement voids the image's marker set: a
      // shared render carries no stamp evidence either way.
      if (existing.markers !== markers) {
        existing.markers = null;
      }
      continue;
    }
    const identity: CardIdentity = {
      key,
      name,
      setSlug,
      publicCode,
      language,
      cardType,
      markers,
      // Language is deliberately excluded (two prints differ only in text, not
      // look). Overnumbered keys apart since it carries its own illustration.
      artKey: `${setSlug}|${name}|${artVariant}|${isOvernumbered === "t" ? "over" : ""}`,
    };
    byKey.set(key, identity);
    identities.push(identity);
  }

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(identities, null, 2)}\n`);
  return new Map(identities.map((c) => [c.key, c]));
}

export function describe(catalog: Map<string, CardIdentity>, key: string | null): string {
  if (!key) {
    return "none";
  }
  const identity = catalog.get(key);
  return identity
    ? `${identity.name} [${identity.publicCode} ${identity.language}]`
    : `unknown:${key.slice(0, 8)}`;
}
