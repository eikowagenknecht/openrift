import type { MetaEventTier } from "@openrift/shared";

/**
 * `uvsgames_event_templates.tier` sets a floor {@link classifyMetaEventTier}
 * can raise but never lower.
 */

/** Order matters: side-event patterns (Pre-RQ, Regional Rebound) must claim their names before the premier/local needles do. */
const SUGGESTION_RULES: readonly { pattern: RegExp; tier: MetaEventTier }[] = [
  { pattern: /pre-?regional|pre-?rq|regional rebound|super nexus night/u, tier: "competitive" },
  { pattern: /regional qualifier|national championship|world championship/u, tier: "premier" },
  { pattern: /showdown|city challenge|\b10k\b|invitational/u, tier: "competitive" },
  {
    pattern: /skirmish|nexus night|open play|learn[ -]?to[ -]?play|league night/u,
    tier: "local",
  },
];

/** Never stored and never classifies an event on its own; a human confirms it into the mapping. */
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

/** Most competitive first, so the lower number wins a comparison. */
const TIER_RANK: Record<MetaEventTier, number> = { premier: 0, competitive: 1, local: 2 };

/** Raises the mapped template tier to `competitive` when the field is large enough; size alone never reaches `premier`. */
export function classifyMetaEventTier(
  event: {
    templateTier?: MetaEventTier | null;
    playerCount?: number | null;
  },
  competitivePlayerFloor: number,
): MetaEventTier {
  const bySize = (event.playerCount ?? 0) >= competitivePlayerFloor ? "competitive" : "local";
  const mapped = event.templateTier ?? "local";
  return TIER_RANK[mapped] <= TIER_RANK[bySize] ? mapped : bySize;
}

/** Only the spellings that actually occur in the source's addresses; extend it when a new tail shows up. */
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

/** Requires a digit in the postal segment so a US/Canadian province abbreviation ("Denver, CO") isn't read as a country code. */
const POSTAL_ISO_TAIL = /,\s*[A-Z\d -]*\d[A-Z\d -]*,\s*(?<iso>[A-Z]{2})$/u;

/** Matches a structured suffix (`"..., 7100, PH"`) or a trailing country name in the store's own language. */
export function countryFromAddress(address: string | null): string | null {
  if (address === null) {
    return null;
  }
  const trimmed = address.trim();
  const isoTail = POSTAL_ISO_TAIL.exec(trimmed)?.groups?.iso;
  if (isoTail !== undefined && ISO_COUNTRIES.has(isoTail)) {
    return isoTail;
  }
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
