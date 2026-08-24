// Everything the `types` barrel exposes (enums, catalog/search/list-rule/
// pricing types, API response types, and their runtime helpers) surfaces at
// the package root. Wildcard on purpose: a name added to `./types` becomes
// importable from `@openrift/shared` without a second manual entry here.
export * from "./types/index.js";

export type { RelativeTimeOptions } from "./format-date.js";
export {
  dateLeafParts,
  formatDay,
  formatDayLocal,
  formatDayTime,
  formatDayTimeLocal,
  formatMonth,
  formatRelativeDay,
  formatRelativeTime,
  formatTimeLocal,
} from "./format-date.js";

export type { AvailableFilters, FilterCounts } from "./filters.js";
export {
  computeFilterCounts,
  filterCards,
  getAvailableFilters,
  matchesDomains,
  noneExcluded,
  parseSearchTerms,
  searchPrefixFields,
  sortCards,
} from "./filters.js";
export type { SortCardsOptions } from "./filters.js";

export type { SetOrderInfo } from "./set-order.js";
export { orderSetsMainFirst, setIndexById, UNKNOWN_SET_INDEX } from "./set-order.js";

export type { ReleasePrecision, SetRelease, SetReleases } from "./set-release.js";
export {
  earliestRelease,
  formatReleasePeriod,
  isReleased,
  isReleasedAnywhere,
  isReleasedIn,
  normalizeToPeriodStart,
  releasePeriodEnd,
  todayUtc,
} from "./set-release.js";

export { findStandardArtFallback, isStandardPrinting } from "./standard.js";
export type { StandardArtFallback } from "./standard.js";

export { effectiveTournamentState } from "./tournament-lifecycle.js";
export type { EffectiveTournamentState } from "./tournament-lifecycle.js";

export {
  cardTradeState,
  isLiveCardTradeStatus,
  isTradedCardTrade,
  needsViewerAction,
  TRADED_CARD_TRADE_STATUSES,
} from "./card-trade-lifecycle.js";
export type { CardTradeState, CardTradeStateFields } from "./card-trade-lifecycle.js";

export type {
  ExpandedEntry,
  KeepPriorityOrders,
  ManualEntryRow,
  OwnedCopyRow,
  RuleEvalContext,
  VirtualEntry,
} from "./list-rule-eval.js";
export {
  evaluateListRule,
  evaluateListRules,
  expandList,
  ownedCopyPrintingScope,
} from "./list-rule-eval.js";

export { CONTACT_METHOD_LABELS, formatContactMethodsSummary } from "./contact-methods.js";

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
  marketplaceLabel,
} from "./marketplace.js";

export { foldForSearch, squashForSearch } from "./search-fold.js";

export {
  TIER_COLORS,
  TIER_LABEL_INK,
  TIER_UNRANKED_COLOR,
  tierColor,
  tierRowColor,
} from "./tier-colors.js";

export type {
  CardResolution,
  CardSearchIndex,
  SearchableCard,
  SearchablePrintingCodes,
} from "./card-search.js";
export {
  buildCardIndex,
  CARD_SEARCH_MIN_QUERY_LENGTH,
  CARD_SEARCH_RESULT_LIMIT,
  findCard,
  matchesCardQuery,
  resolveCard,
  searchCards,
} from "./card-search.js";

export { formatPrintingVariantLabel, formatPrintingVariantLabelParts } from "./printing-label.js";
export type {
  PrintingVariantLabelParts,
  VariantLabelEnumLabels,
  VariantLabelPrinting,
} from "./printing-label.js";

export {
  extractCardIdFromShortCode,
  formatPrintingLabel,
  cardSearchAltNames,
  centsToDollars,
  deckIdentityLabels,
  deduplicateByCard,
  getOrientation,
  legendDisplayName,
  preferredPrinting,
  mostCommonValue,
  normalizeNameForIdentity,
  slugifyName,
  sortByLanguageAndCanonicalRank,
  straightenApostrophes,
} from "./utils.js";

export { extractBracketedTerms, extractKeywords } from "./keywords.js";

export type { CardTextToken } from "./card-text.js";
export { tokenizeCardText } from "./card-text.js";

export { descriptionSnippet } from "./description-snippet.js";

export type { LinkHost } from "./link-hosts.js";
export {
  ALLOWED_LINK_SITE_NAMES,
  isAllowedLinkUrl,
  linkHostLabel,
  resolveLinkHost,
} from "./link-hosts.js";

export type { ImageVariant } from "./image-url.js";
export { imageUrl } from "./image-url.js";

export { getPlaysetSize } from "./playset.js";

export { RIOT_ID_FORMAT_MESSAGE, validateRiotId } from "./riot-id.js";

export type { SourceSlot } from "./zone-inference.js";
export { inferZone, sourceSlotForZone } from "./zone-inference.js";

export {
  REQUIRED_ZONES,
  ZONE_EXPECTED,
  ZONE_LABELS,
  isCountedZone,
  requiredZoneProgress,
  zoneExpected,
  zoneLabel,
} from "./deck-zones.js";

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

export {
  buildTermAnchors,
  compareRuleNumbers,
  formatRuleNumber,
  RULE_REFERENCE_REGEX,
} from "./rules.js";

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
