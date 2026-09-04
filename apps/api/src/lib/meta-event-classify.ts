import type { MetaEventTier } from "@openrift/shared";

/**
 * Files an event into the archive's tier vocabulary and reads a country off a
 * venue address.
 *
 * `uvsgames_event_templates.tier` sets a floor {@link classifyMetaEventTier}
 * can raise but never lower. Free-text name matching only feeds
 * {@link suggestTierForTemplateName}'s admin-confirmed prefill.
 */

/**
 * Matched against a template's name, for the mapping UI's suggestion. Order
 * matters: the side events run alongside a Regional Qualifier ("Pre-RQ
 * Challenge", "Regional Rebound", "Super Nexus Night") contain the premier and
 * local needles, so their own patterns must claim them first.
 *
 * The local needle is "league night", never a bare "league": the game's own
 * name is "Riftbound: League of Legends TCG", which templates spell out.
 */
const SUGGESTION_RULES: readonly { pattern: RegExp; tier: MetaEventTier }[] = [
  { pattern: /pre-?regional|pre-?rq|regional rebound|super nexus night/u, tier: "competitive" },
  { pattern: /regional qualifier|national championship|world championship/u, tier: "premier" },
  { pattern: /showdown|city challenge|\b10k\b|invitational/u, tier: "competitive" },
  {
    pattern: /skirmish|nexus night|open play|learn[ -]?to[ -]?play|league night/u,
    tier: "local",
  },
];

/**
 * What the mapping UI prefills for an unmapped template. Never stored and
 * never classifies an event on its own — a human confirms it into the mapping.
 *
 * @returns The suggested tier, or null when the name suggests nothing.
 */
export function suggestTierForTemplateName(name: string | null): MetaEventTier | null {
  if (name === null) {
    return null;
  }
  const haystack = name.toLowerCase();
  for (const rule of SUGGESTION_RULES) {
    if (rule.pattern.test(haystack)) {
      return rule.tier;
    }
  }
  return null;
}

/** Field sizes this large are competitive whatever the organizer named them. */
const COMPETITIVE_PLAYER_FLOOR = 128;

/** Most competitive first, so the lower number wins a comparison. */
const TIER_RANK: Record<MetaEventTier, number> = { premier: 0, competitive: 1, local: 2 };

/**
 * Files one event into a tier: the mapped template tier, raised to
 * `competitive` if the field is large enough, never lowered. Size alone never
 * reaches `premier`.
 *
 * @returns The tier, `"local"` when nothing claims more.
 */
export function classifyMetaEventTier(event: {
  /** The admin-curated tier of the event's template, when it runs a mapped one. */
  templateTier?: MetaEventTier | null;
  playerCount?: number | null;
}): MetaEventTier {
  const bySize = (event.playerCount ?? 0) >= COMPETITIVE_PLAYER_FLOOR ? "competitive" : "local";
  const mapped = event.templateTier ?? "local";
  return TIER_RANK[mapped] <= TIER_RANK[bySize] ? mapped : bySize;
}

/**
 * Country names as venue addresses end, lowercase, mapped to ISO 3166-1
 * alpha-2. The source's addresses either end in a structured ", CC" suffix or
 * in a country name in the store's own language, so this table only needs the
 * spellings that actually occur — extend it when a new tail shows up, a miss
 * stores null and the admin can fill the field in.
 */
const COUNTRY_NAME_TO_ISO: ReadonlyMap<string, string> = new Map([
  ["usa", "US"],
  ["united states", "US"],
  ["canada", "CA"],
  ["mexico", "MX"],
  ["méxico", "MX"],
  ["brazil", "BR"],
  ["brasil", "BR"],
  ["argentina", "AR"],
  ["chile", "CL"],
  ["colombia", "CO"],
  ["peru", "PE"],
  ["perú", "PE"],
  ["ecuador", "EC"],
  ["uruguay", "UY"],
  ["united kingdom", "GB"],
  ["england", "GB"],
  ["scotland", "GB"],
  ["wales", "GB"],
  ["northern ireland", "GB"],
  ["ireland", "IE"],
  ["france", "FR"],
  ["germany", "DE"],
  ["deutschland", "DE"],
  ["austria", "AT"],
  ["österreich", "AT"],
  ["switzerland", "CH"],
  ["schweiz", "CH"],
  ["suisse", "CH"],
  ["italy", "IT"],
  ["italia", "IT"],
  ["spain", "ES"],
  ["españa", "ES"],
  ["espana", "ES"],
  ["portugal", "PT"],
  ["netherlands", "NL"],
  ["nederland", "NL"],
  ["belgium", "BE"],
  ["belgië", "BE"],
  ["belgique", "BE"],
  ["poland", "PL"],
  ["polska", "PL"],
  ["czechia", "CZ"],
  ["czech republic", "CZ"],
  ["denmark", "DK"],
  ["sweden", "SE"],
  ["norway", "NO"],
  ["finland", "FI"],
  ["greece", "GR"],
  ["türkiye", "TR"],
  ["turkey", "TR"],
  ["australia", "AU"],
  ["new zealand", "NZ"],
  ["japan", "JP"],
  ["south korea", "KR"],
  ["china", "CN"],
  ["taiwan", "TW"],
  ["hong kong", "HK"],
  ["singapore", "SG"],
  ["malaysia", "MY"],
  ["indonesia", "ID"],
  ["philippines", "PH"],
  ["thailand", "TH"],
  ["vietnam", "VN"],
  ["india", "IN"],
  ["south africa", "ZA"],
]);

/** The assigned ISO 3166-1 alpha-2 codes, so an unassigned two-letter tail stores nothing. */
const ISO_COUNTRIES = new Set(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
   BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
   EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
   HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC
   LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
   NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
   SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
   TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/u),
);

/**
 * The structured tail the source emits, where a postal segment stands between
 * the city and the code (`", 7100, PH"`). The postal segment is what separates
 * a country code from a US state or Canadian province abbreviation: "Sacramento,
 * CA" is not Canada, "Denver, CO" is not Colombia, and roughly thirty such
 * abbreviations collide with an assigned code. So the segment must hold a digit
 * and no lowercase, which a city name never does.
 */
const POSTAL_ISO_TAIL = /,\s*[A-Z\d -]*\d[A-Z\d -]*,\s*(?<iso>[A-Z]{2})$/u;

/**
 * Reads the country off a venue address.
 *
 * Two shapes cover the source's data: a structured suffix (`"..., 7100, PH"`),
 * and a trailing country name in whatever language the store wrote
 * (`"..., Deutschland"`, `"..., Singapore 437844"` — postal digits stripped).
 *
 * @returns The ISO 3166-1 alpha-2 code, or null when neither shape matches.
 */
export function countryFromAddress(address: string | null): string | null {
  if (address === null) {
    return null;
  }
  const trimmed = address.trim();
  const isoTail = POSTAL_ISO_TAIL.exec(trimmed)?.groups?.iso;
  if (isoTail !== undefined && ISO_COUNTRIES.has(isoTail)) {
    return isoTail;
  }
  // Postal codes trail the country name in some formats ("Singapore 437844").
  const withoutDigits = trimmed.replace(/[\d\s,.-]+$/u, "").toLowerCase();
  for (const [name, iso] of COUNTRY_NAME_TO_ISO) {
    if (!withoutDigits.endsWith(name)) {
      continue;
    }
    const before = withoutDigits.at(-name.length - 1);
    if (before === undefined || before === " " || before === ",") {
      return iso;
    }
  }
  return null;
}
