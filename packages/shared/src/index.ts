// Everything the `types` barrel exposes (enums, catalog/search/list-rule/
// pricing types, API response types, and their runtime helpers) surfaces at
// the package root. Wildcard on purpose: a name added to `./types` becomes
// importable from `@openrift/shared` without a second manual entry here.
export * from "./types/index.js";

export type { AvailableFilters, FilterCounts } from "./filters.js";
export {
  computeFilterCounts,
  filterCards,
  getAvailableFilters,
  parseSearchTerms,
  sortCards,
} from "./filters.js";
export type { SortCardsOptions } from "./filters.js";

export { isStandardPrinting } from "./standard.js";

export type {
  ExpandedEntry,
  KeepPriorityOrders,
  ManualEntryRow,
  OwnedCopyRow,
  RuleEvalContext,
  VirtualEntry,
} from "./list-rule-eval.js";
export { evaluateListRule, evaluateListRules, expandList } from "./list-rule-eval.js";

export { CONTACT_METHOD_LABELS, formatContactMethodsSummary } from "./contact-methods.js";

export { snapshotHeadline } from "./types/api/pricing.js";
export { ERROR_CODES } from "./error-codes.js";
export type { ErrorCode } from "./error-codes.js";

export { EMPTY_PRICE_LOOKUP, priceLookupFromMap } from "./price-lookup.js";

export {
  extractCardIdFromShortCode,
  formatPrintingLabel,
  centsToDollars,
  deduplicateByCard,
  formatDateUTC,
  getOrientation,
  legendDisplayName,
  preferredPrinting,
  mostCommonValue,
  normalizeNameForMatching,
  slugifyName,
  sortByLanguageAndCanonicalRank,
  straightenApostrophes,
} from "./utils.js";

export { extractBracketedTerms, extractKeywords } from "./keywords.js";

export type { ImageVariant } from "./image-url.js";
export { imageUrl } from "./image-url.js";

export { humanizePrintingField } from "./printing-event-fields.js";

export { getPlaysetSize } from "./playset.js";

export { RIOT_ID_FORMAT_MESSAGE, validateRiotId } from "./riot-id.js";

export type { SourceSlot } from "./zone-inference.js";
export { inferZone } from "./zone-inference.js";

export { isAlwaysFoilRarity, LOW_RARITIES, marketplaceFinish, WellKnown } from "./well-known.js";

export type { PackPool, PackPrinting, PackPull, PackResult } from "./pack-opener/index.js";
export type { Random as PackRandom } from "./pack-opener/index.js";
export {
  buildPool,
  isPoolOpenable,
  mathRandom,
  mulberry32,
  openPacks,
} from "./pack-opener/index.js";

export { appendSetTotal, fixTypography } from "./fix-typography.js";

export type { DeckCard, DeckState, DeckViolation } from "./deck-rules.js";
export { formatHasSideboard, validateDeck } from "./deck-rules.js";

export type { DeckCheckCardLine, DeckCheckEntrySource } from "./deck-check.js";
export {
  buildContentHashInput,
  deckCheckEntrySource,
  diffCardLines,
  MANUAL_ENTRY_EXTERNAL_ID_PREFIX,
  mapSectionToZone,
  SELF_SUBMIT_EXTERNAL_ID_PREFIX,
} from "./deck-check.js";

export { compareRuleNumbers } from "./rules.js";

export { hostSlugFromUrl } from "./host-slug.js";

export type {
  LocalSearchBudget,
  PairingConfig,
  PairingPlayer,
  PairingResult,
  PairingStrategy,
  PairingStrategyName,
  PairingWarning,
  Pod,
  PodPenaltyBreakdown,
  PodSizes,
  ScoringScheme,
} from "./pairing/index.js";
export {
  computePairingWarnings,
  DEFAULT_LOCAL_SEARCH_BUDGET,
  DEFAULT_PAIRING_CONFIG,
  determinePodSizes,
  evaluatePairing,
  evaluatePod,
  generatePairing,
  InvalidPlayerCountError,
  makeLocalSearchStrategy,
  placementsFromGamePoints,
  pointsForPlacements,
  SPREAD_WARNING_THRESHOLD,
  suggestedRoundCount,
} from "./pairing/index.js";
