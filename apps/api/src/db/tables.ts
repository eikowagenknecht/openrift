import type { AdminEventsTable } from "./tables/admin-events.js";
import type {
  AccountsTable,
  AdminGrantsTable,
  AdminsTable,
  ApiKeysTable,
  SessionsTable,
  UsersTable,
  VerificationsTable,
} from "./tables/auth.js";
import type {
  CandidateCardsTable,
  CandidatePrintingsTable,
  CardSubmissionsTable,
  IgnoredCandidateCardsTable,
  IgnoredCandidatePrintingsTable,
  PrintingLinkOverridesTable,
} from "./tables/candidates.js";
import type {
  CardBansTable,
  CardCardTypesTable,
  CardCustomTagsTable,
  CardDomainsTable,
  CardErrataTable,
  CardNameAliasesTable,
  CardSuperTypesTable,
  CardTokensTable,
  CardsTable,
  CustomTagCategoriesTable,
  CustomTagsTable,
  DistributionChannelsTable,
  FormatsTable,
  ImageFilesTable,
  KeywordTranslationsTable,
  KeywordsTable,
  LanguagesTable,
  MarkersTable,
  PrintingCitationsTable,
  PrintingDistributionChannelsTable,
  PrintingEventsTable,
  PrintingImagesTable,
  PrintingMarkersTable,
  PrintingsTable,
  RuleVersionsTable,
  RulesTable,
  SetReleasesTable,
  SetsTable,
  TagCategoriesTable,
  TagDefinitionsTable,
} from "./tables/catalog.js";
import type {
  CollectionDeckbuildingPrefsTable,
  CollectionEventsTable,
  CollectionSidebarPrefsTable,
  CollectionsTable,
  CopiesTable,
} from "./tables/collections.js";
import type {
  DeckCardsTable,
  DeckFolderEntriesTable,
  DeckFoldersTable,
  DeckMatchupPlansTable,
  DeckMatchupSwapsTable,
  DeckPlansTable,
  DecksTable,
} from "./tables/decks.js";
import type {
  FriendGroupCollectionSharesTable,
  FriendGroupDiscordLinksTable,
  FriendGroupInvitesTable,
  FriendGroupListSharesTable,
  FriendGroupMemberContactsTable,
  FriendGroupMembersTable,
  FriendGroupShopsTable,
  FriendGroupsTable,
  UserContactMethodsTable,
} from "./tables/friend-groups.js";
import type { ListEntriesTable, ListsTable } from "./tables/lists.js";
import type { LoanCopiesTable, LoansTable } from "./tables/loans.js";
import type {
  MarketplaceGroupsTable,
  MarketplaceIgnoredProductsTable,
  MarketplaceIgnoredVariantsTable,
  MarketplaceProductCardOverridesTable,
  MarketplaceProductPricesTable,
  CardmarketSyncStateTable,
  MarketplaceProductVariantsTable,
  MarketplaceProductsTable,
  ProductPrintingsTable,
  ProductsTable,
} from "./tables/marketplace.js";
import type {
  IgnoredMetaSourceEventsTable,
  IgnoredMetaSourcePlayersTable,
  PlayloltcgDecklistCardsTable,
  PlayloltcgDecklistsTable,
  PlayloltcgEventChecksTable,
  PlayloltcgEventStandingsTable,
  PlayloltcgEventsTable,
  PlayloltcgShopsTable,
  TopdeckDecklistCardsTable,
  TopdeckDecklistsTable,
  TopdeckEventStandingsTable,
  TopdeckEventsTable,
  UvsgamesDecklistCardsTable,
  UvsgamesDecklistsTable,
  UvsgamesEventChecksTable,
  UvsgamesEventMatchesTable,
  UvsgamesEventPhasesTable,
  UvsgamesEventStandingsTable,
  UvsgamesEventTemplatesTable,
  UvsgamesEventsTable,
  UvsgamesFormatMappingsTable,
  UvsgamesIdProbesTable,
  UvsgamesPlayersTable,
  UvsgamesStoresTable,
} from "./tables/meta-sources.js";
import type {
  MetaCreditsTable,
  MetaEventMatchesTable,
  MetaEventOverlaysTable,
  MetaEventPhasesTable,
  MetaEventPlayerOverlayCardsTable,
  MetaEventPlayerOverlaysTable,
  MetaEventPlayersTable,
  MetaEventSourcesTable,
  MetaEventsTable,
  MetaPlayerLinksTable,
  MetaSubmissionsTable,
  MetaSyncSettingsTable,
} from "./tables/meta.js";
import type { OrganizationMembersTable, OrganizationsTable } from "./tables/organizations.js";
import type {
  ArtVariantsTable,
  CardSizesTable,
  CardTypesTable,
  ConditionsTable,
  DeckFormatsTable,
  DeckZonesTable,
  DomainsTable,
  FinishesTable,
  GradersTable,
  RaritiesTable,
  SuperTypesTable,
} from "./tables/reference.js";
import type {
  FeatureFlagsTable,
  JobRunsTable,
  JobSchedulesTable,
  ProviderSettingsTable,
  ScanIndexTable,
  ScanReportsTable,
  SiteSettingsTable,
  UserFeatureFlagsTable,
  UserPreferencesTable,
} from "./tables/settings.js";
import type { OverlayChannelsTable, StagePresetsTable, TierListsTable } from "./tables/stage.js";
import type {
  DeckCheckEntriesTable,
  DeckCheckEntryCardsTable,
  DeckCheckKeysTable,
  PodByesTable,
  PodMembersTable,
  PodRoundsTable,
  PodsTable,
  TournamentGroupsTable,
  TournamentLegendMetaSharesTable,
  TournamentParticipantsTable,
  TournamentStaffTable,
  TournamentTeamsTable,
  TournamentsTable,
} from "./tables/tournaments.js";
import type { CardTradeCopiesTable, CardTradesTable } from "./tables/trades.js";
import type {
  MvCardAggregatesView,
  MvDailyPrintingPricesView,
  MvLatestPrintingPricesView,
  MvPrintingFoilTwinsView,
  PrintingsOrderedView,
} from "./tables/views.js";

export interface Database {
  sets: SetsTable;
  setReleases: SetReleasesTable;
  cards: CardsTable;
  cardErrata: CardErrataTable;
  printings: PrintingsTable;

  marketplaceGroups: MarketplaceGroupsTable;
  marketplaceProducts: MarketplaceProductsTable;
  marketplaceProductVariants: MarketplaceProductVariantsTable;
  cardmarketSyncState: CardmarketSyncStateTable;
  marketplaceProductPrices: MarketplaceProductPricesTable;
  marketplaceIgnoredProducts: MarketplaceIgnoredProductsTable;
  marketplaceIgnoredVariants: MarketplaceIgnoredVariantsTable;
  marketplaceProductCardOverrides: MarketplaceProductCardOverridesTable;

  admins: AdminsTable;
  adminGrants: AdminGrantsTable;

  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
  apiKeys: ApiKeysTable;

  collections: CollectionsTable;
  copies: CopiesTable;
  collectionDeckbuildingPrefs: CollectionDeckbuildingPrefsTable;
  collectionSidebarPrefs: CollectionSidebarPrefsTable;
  collectionEvents: CollectionEventsTable;

  adminEvents: AdminEventsTable;
  decks: DecksTable;
  deckCards: DeckCardsTable;
  deckPlans: DeckPlansTable;
  deckMatchupPlans: DeckMatchupPlansTable;
  deckMatchupSwaps: DeckMatchupSwapsTable;

  deckFolders: DeckFoldersTable;
  deckFolderEntries: DeckFolderEntriesTable;

  uvsgamesEvents: UvsgamesEventsTable;
  uvsgamesEventTemplates: UvsgamesEventTemplatesTable;
  uvsgamesFormatMappings: UvsgamesFormatMappingsTable;
  uvsgamesStores: UvsgamesStoresTable;
  uvsgamesPlayers: UvsgamesPlayersTable;
  uvsgamesIdProbes: UvsgamesIdProbesTable;
  uvsgamesEventChecks: UvsgamesEventChecksTable;
  uvsgamesEventStandings: UvsgamesEventStandingsTable;
  uvsgamesEventPhases: UvsgamesEventPhasesTable;
  uvsgamesEventMatches: UvsgamesEventMatchesTable;
  uvsgamesDecklists: UvsgamesDecklistsTable;
  uvsgamesDecklistCards: UvsgamesDecklistCardsTable;
  playloltcgShops: PlayloltcgShopsTable;
  playloltcgEvents: PlayloltcgEventsTable;
  playloltcgEventChecks: PlayloltcgEventChecksTable;
  playloltcgEventStandings: PlayloltcgEventStandingsTable;
  playloltcgDecklists: PlayloltcgDecklistsTable;
  playloltcgDecklistCards: PlayloltcgDecklistCardsTable;
  topdeckEvents: TopdeckEventsTable;
  topdeckEventStandings: TopdeckEventStandingsTable;
  topdeckDecklists: TopdeckDecklistsTable;
  topdeckDecklistCards: TopdeckDecklistCardsTable;
  metaSyncSettings: MetaSyncSettingsTable;
  metaEvents: MetaEventsTable;
  metaEventPlayers: MetaEventPlayersTable;
  metaEventMatches: MetaEventMatchesTable;
  metaEventPhases: MetaEventPhasesTable;
  metaEventOverlays: MetaEventOverlaysTable;
  metaEventPlayerOverlays: MetaEventPlayerOverlaysTable;
  metaEventPlayerOverlayCards: MetaEventPlayerOverlayCardsTable;
  ignoredMetaSourceEvents: IgnoredMetaSourceEventsTable;
  ignoredMetaSourcePlayers: IgnoredMetaSourcePlayersTable;
  metaEventSources: MetaEventSourcesTable;
  metaPlayerLinks: MetaPlayerLinksTable;
  metaCredits: MetaCreditsTable;
  metaSubmissions: MetaSubmissionsTable;

  tierLists: TierListsTable;

  overlayChannels: OverlayChannelsTable;

  stagePresets: StagePresetsTable;

  lists: ListsTable;
  listEntries: ListEntriesTable;

  friendGroups: FriendGroupsTable;
  friendGroupMembers: FriendGroupMembersTable;
  friendGroupInvites: FriendGroupInvitesTable;
  friendGroupDiscordLinks: FriendGroupDiscordLinksTable;
  friendGroupListShares: FriendGroupListSharesTable;
  friendGroupCollectionShares: FriendGroupCollectionSharesTable;
  friendGroupShops: FriendGroupShopsTable;

  userContactMethods: UserContactMethodsTable;
  friendGroupMemberContacts: FriendGroupMemberContactsTable;

  organizations: OrganizationsTable;
  organizationMembers: OrganizationMembersTable;

  tournaments: TournamentsTable;
  tournamentStaff: TournamentStaffTable;
  tournamentParticipants: TournamentParticipantsTable;
  tournamentTeams: TournamentTeamsTable;
  tournamentGroups: TournamentGroupsTable;
  tournamentLegendMetaShares: TournamentLegendMetaSharesTable;
  podRounds: PodRoundsTable;
  pods: PodsTable;
  podMembers: PodMembersTable;
  podByes: PodByesTable;

  cardTrades: CardTradesTable;
  cardTradeCopies: CardTradeCopiesTable;

  loans: LoansTable;
  loanCopies: LoanCopiesTable;

  deckCheckEntries: DeckCheckEntriesTable;
  deckCheckEntryCards: DeckCheckEntryCardsTable;
  deckCheckKeys: DeckCheckKeysTable;

  candidateCards: CandidateCardsTable;
  candidatePrintings: CandidatePrintingsTable;
  cardNameAliases: CardNameAliasesTable;

  ignoredCandidateCards: IgnoredCandidateCardsTable;
  ignoredCandidatePrintings: IgnoredCandidatePrintingsTable;

  cardSubmissions: CardSubmissionsTable;
  scanReports: ScanReportsTable;

  printingLinkOverrides: PrintingLinkOverridesTable;

  imageFiles: ImageFilesTable;
  printingImages: PrintingImagesTable;

  languages: LanguagesTable;

  markers: MarkersTable;
  printingMarkers: PrintingMarkersTable;
  distributionChannels: DistributionChannelsTable;
  printingDistributionChannels: PrintingDistributionChannelsTable;

  printingCitations: PrintingCitationsTable;

  customTagCategories: CustomTagCategoriesTable;
  customTags: CustomTagsTable;
  cardCustomTags: CardCustomTagsTable;

  tagCategories: TagCategoriesTable;
  tagDefinitions: TagDefinitionsTable;

  products: ProductsTable;
  productPrintings: ProductPrintingsTable;

  providerSettings: ProviderSettingsTable;

  featureFlags: FeatureFlagsTable;

  userFeatureFlags: UserFeatureFlagsTable;

  keywords: KeywordsTable;

  keywordTranslations: KeywordTranslationsTable;

  siteSettings: SiteSettingsTable;

  userPreferences: UserPreferencesTable;

  formats: FormatsTable;

  cardBans: CardBansTable;

  ruleVersions: RuleVersionsTable;
  rules: RulesTable;

  cardTypes: CardTypesTable;
  rarities: RaritiesTable;
  domains: DomainsTable;
  superTypes: SuperTypesTable;
  finishes: FinishesTable;
  artVariants: ArtVariantsTable;
  cardSizes: CardSizesTable;
  deckFormats: DeckFormatsTable;
  deckZones: DeckZonesTable;
  conditions: ConditionsTable;
  graders: GradersTable;

  cardDomains: CardDomainsTable;
  cardSuperTypes: CardSuperTypesTable;
  cardCardTypes: CardCardTypesTable;
  cardTokens: CardTokensTable;

  printingEvents: PrintingEventsTable;

  jobRuns: JobRunsTable;
  jobSchedules: JobSchedulesTable;

  scanIndex: ScanIndexTable;

  mvLatestPrintingPrices: MvLatestPrintingPricesView;
  mvDailyPrintingPrices: MvDailyPrintingPricesView;
  mvCardAggregates: MvCardAggregatesView;
  mvPrintingFoilTwins: MvPrintingFoilTwinsView;

  printingsOrdered: PrintingsOrderedView;
}
