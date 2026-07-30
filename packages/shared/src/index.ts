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

export { findStandardArtFallback, isStandardPrinting } from "./standard.js";
export type { StandardArtFallback } from "./standard.js";

export { effectiveTournamentState } from "./tournament-lifecycle.js";
export type { EffectiveTournamentState } from "./tournament-lifecycle.js";

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

export { ADMIN_SECTION_LABELS, ADMIN_SECTION_SLUGS, isAdminSectionSlug } from "./admin-sections.js";
export type { AdminSectionSlug } from "./admin-sections.js";
export type { ErrorCode } from "./error-codes.js";

export { EMPTY_PRICE_LOOKUP, priceLookupFromMap } from "./price-lookup.js";

export {
  affiliateUrl,
  cardmarketLangParam,
  cardtraderAffiliateUrl,
  MARKETPLACE_LINKS,
  MARKETPLACE_SHORT_LABELS,
  marketplaceLabel,
} from "./marketplace.js";

export { foldForSearch, squashForSearch } from "./search-fold.js";

export { formatPrintingVariantLabel, formatPrintingVariantLabelParts } from "./printing-label.js";
export type {
  PrintingVariantLabelParts,
  VariantLabelEnumLabels,
  VariantLabelPrinting,
} from "./printing-label.js";

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

export { getPlaysetSize } from "./playset.js";

export { RIOT_ID_FORMAT_MESSAGE, validateRiotId } from "./riot-id.js";

export type { SourceSlot } from "./zone-inference.js";
export { inferZone } from "./zone-inference.js";

export type { DeckCodeParseResult, DeckImportEntry } from "./deck-code.js";
export { isDeckCode, parsePiltoverDeckCode } from "./deck-code.js";

export {
  isAlwaysFoilRarity,
  isBaseBanFormat,
  LOW_RARITIES,
  marketplaceFinish,
  RENAMED_LANGUAGES,
  WellKnown,
} from "./well-known.js";

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
export {
  SIDEBOARD_MAXIMUM,
  UNLIMITED_COPIES,
  copyLimitFor,
  formatHasSideboard,
  validateDeck,
} from "./deck-rules.js";

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

export type { CopyMetadata } from "./copy-metadata.js";
export {
  copyHasMetadata,
  definedCopyMetadataFields,
  normalizeCopyMetadataPatch,
} from "./copy-metadata.js";

export { hostSlugFromUrl } from "./host-slug.js";

export type {
  GeneratePairingOptions,
  LocalSearchBudget,
  PairingConfig,
  PairingMode,
  PairingPlayer,
  PairingResult,
  PairingStrategy,
  PairingStrategyName,
  PairingWarning,
  Pod,
  PodPenaltyBreakdown,
  PodSizes,
  ScoringScheme,
  TeamSnapshotPlayer,
  TeamUnitsResult,
} from "./pairing/index.js";
export {
  arrangeSeating,
  assignTableNumbers,
  buildTeamUnits,
  collapseTeamByes,
  collapseTeamPods,
  computePairingWarnings,
  DEFAULT_LOCAL_SEARCH_BUDGET,
  expandTeamPairing,
  foldSeatingHistory,
  DEFAULT_PAIRING_CONFIG,
  determinePodSizes,
  determineSwissPodSizes,
  evaluatePairing,
  evaluatePod,
  generatePairing,
  InvalidPlayerCountError,
  makeLocalSearchStrategy,
  pickAutoBye,
  placementsFromGamePoints,
  pointsForPlacements,
  SPREAD_WARNING_THRESHOLD,
  suggestedRoundCount,
  swissPointsForPlacements,
} from "./pairing/index.js";
