import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowDownUpIcon,
  BookOpenIcon,
  BoxIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  HandHeartIcon,
  LayersIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListChecksIcon,
  MessageSquareIcon,
  MonitorPlayIcon,
  PackageIcon,
  PackageOpenIcon,
  PaintbrushIcon,
  ScanLineIcon,
  Share2Icon,
  SwordsIcon,
  TicketIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect } from "react";
import { siGithub } from "simple-icons";

import { Heading } from "@/components/heading";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { useSession } from "@/lib/auth-session";
import { landingSummaryQueryOptions } from "@/lib/landing-summary-query";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

import { BoxVignette } from "./box-vignette";
import { ClipFrame, cornerClip } from "./clip-frame";
import {
  ActionArrow,
  FEATURE_ACTION_CLASS,
  FEATURE_HEADING_CLASS,
  FeatureSection,
  SectionRule,
} from "./feature-section";
import {
  CatalogVignette,
  CollectionsVignette,
  DecksVignette,
  DiscordVignette,
  GroupsVignette,
  ImportVignette,
  ListsVignette,
  PricesVignette,
  TournamentsVignette,
} from "./feature-vignettes";
import { LoansVignette } from "./loans-vignette";
import { PromosVignette } from "./promos-vignette";
import { Reveal } from "./reveal";
import { RulesVignette } from "./rules-vignette";
import { ScanVignette } from "./scan-vignette";
import { ShareVignette } from "./share-vignette";
import { StageVignette } from "./stage-vignette";
import { TestVignette } from "./test-vignette";
import { TrackerVignette } from "./tracker-vignette";
import { VariantsVignette } from "./variants-vignette";

const TOC_ITEMS = [
  { hash: "catalog", label: "Catalog", icon: LayoutGridIcon },
  { hash: "scan", label: "Scanner", icon: ScanLineIcon },
  { hash: "collections", label: "Collections", icon: LibraryIcon },
  { hash: "lists", label: "Lists", icon: ListChecksIcon },
  { hash: "import", label: "Import", icon: ArrowDownUpIcon },
  { hash: "prices", label: "Prices", icon: TrendingUpIcon },
  { hash: "promos", label: "Promos", icon: TicketIcon },
  { hash: "groups", label: "Groups", icon: UsersIcon },
  { hash: "loans", label: "Loans", icon: HandHeartIcon },
  { hash: "decks", label: "Decks", icon: LayersIcon },
  { hash: "box", label: "Deck box", icon: BoxIcon },
  { hash: "variants", label: "Variants", icon: GitBranchIcon },
  { hash: "test", label: "Test bench", icon: FlaskConicalIcon },
  { hash: "share", label: "Share", icon: Share2Icon },
  { hash: "discord", label: "Discord", icon: MessageSquareIcon },
  { hash: "tournaments", label: "Tournaments", icon: TrophyIcon },
  { hash: "stage", label: "Stage", icon: MonitorPlayIcon },
  { hash: "rules", label: "Rules", icon: BookOpenIcon },
  { hash: "tracker", label: "Match tracker", icon: SwordsIcon },
  { hash: "toolbox", label: "The rest", icon: WrenchIcon },
] as const;

const TOOLBOX_TILES = [
  {
    icon: PackageOpenIcon,
    label: "Pack opener",
    blurb: "Crack virtual packs",
    to: "/pack-opener",
  },
  {
    icon: PaintbrushIcon,
    label: "Card designer",
    blurb: "Make your own cards",
    to: "/card-designer",
  },
  { icon: PackageIcon, label: "Products", blurb: "Every sealed product", to: "/products" },
] as const;

const CTA_CUT = 12;

function TableOfContents() {
  return (
    <nav aria-label="Features" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
      {TOC_ITEMS.map((item) => (
        <ClipFrame key={item.hash} tone="border" cut={12} className="h-full p-0">
          <a
            href={`#${item.hash}`}
            className="hover:bg-secondary focus-visible:ring-ring flex h-full flex-col items-center gap-2 p-3 text-center text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          >
            <item.icon className="text-primary size-5" aria-hidden="true" />
            <span className="leading-tight">{item.label}</span>
          </a>
        </ClipFrame>
      ))}
    </nav>
  );
}

function Toolbox() {
  return (
    <Reveal>
      <section id="toolbox" className="flex flex-col gap-6 py-14 sm:py-20">
        <div className="flex flex-col items-start gap-3">
          <Heading level={1} as="h2" className={FEATURE_HEADING_CLASS}>
            And the rest
          </Heading>
          <SectionRule />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TOOLBOX_TILES.map((tile) => (
            <ClipFrame key={tile.label} tone="border" cut={12} className="h-full p-0">
              <Link
                to={tile.to}
                className="hover:bg-secondary focus-visible:ring-ring flex h-full flex-col gap-1.5 p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              >
                <tile.icon className="text-primary size-5" aria-hidden="true" />
                <span className="font-heading font-medium">{tile.label}</span>
                <span className="text-muted-foreground text-sm">{tile.blurb}</span>
              </Link>
            </ClipFrame>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

function ClosingBlock({ signedOut }: { signedOut: boolean }) {
  return (
    <Reveal>
      <section className="flex flex-col items-start gap-4 py-14 sm:py-20">
        <Heading level={1} as="h2" className={FEATURE_HEADING_CLASS}>
          Free. No ads. Open source.
        </Heading>
        <SectionRule />
        <p className="text-muted-foreground max-w-prose">
          OpenRift is built by one person, with help welcome. The code is on GitHub.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/cards"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring font-heading inline-flex h-11 items-center px-7 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            style={{ clipPath: cornerClip(CTA_CUT) }}
          >
            Browse cards
          </Link>
          {signedOut && (
            <span
              className="bg-border-accent inline-block p-px"
              style={{ clipPath: cornerClip(CTA_CUT) }}
            >
              <Link
                to="/signup"
                search={{ redirect: undefined, email: undefined }}
                className="bg-background hover:bg-secondary focus-visible:ring-ring font-heading inline-flex h-11 items-center px-7 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                style={{ clipPath: cornerClip(CTA_CUT) }}
              >
                Sign up free
              </Link>
            </span>
          )}
        </div>
        <a
          href={SOCIAL_LINKS.githubRepo}
          target="_blank"
          rel="noreferrer"
          className={FEATURE_ACTION_CLASS}
        >
          <svg role="img" viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
            <path d={siGithub.path} />
          </svg>
          OpenRift on GitHub
        </a>
      </section>
    </Reveal>
  );
}

export function FeaturesPage() {
  const { data } = useQuery(landingSummaryQueryOptions);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const thumbnailUrls = (data?.thumbnailIds ?? []).map((id) => imageUrl(id, "400w"));
  const taggedThumbnails = (data?.thumbnails ?? []).map((thumb) => ({
    url: imageUrl(thumb.imageId, "400w"),
    rarity: thumb.rarity,
    domains: thumb.domains,
  }));

  // Same idle-time /cards warm-up the landing page does: fetch the lazy chunk
  // and run its loader while the visitor reads, so the catalog links land on a
  // live grid instead of a Suspense fallback.
  useEffect(() => {
    if (typeof requestIdleCallback === "undefined") {
      return;
    }
    const handle = requestIdleCallback(() => {
      void router.preloadRoute({ to: "/cards" });
    });
    return () => cancelIdleCallback(handle);
  }, [router]);

  const sections = [
    {
      id: "catalog",
      title: "Every card, every printing",
      description:
        "The whole catalog: English, Chinese, French, and Korean printings, promos included. Filter by set, rarity, domain, finish, or language, and search full card text.",
      action: (
        <Link to="/cards" className={FEATURE_ACTION_CLASS}>
          Open the catalog
          <ActionArrow />
        </Link>
      ),
      vignette: <CatalogVignette thumbnails={taggedThumbnails} cardCount={data?.cardCount} />,
    },
    {
      id: "scan",
      title: "Scan cards with your camera",
      description:
        "The scanner recognizes the exact printing, not just the name. Add a whole box to your collection in one sitting.",
      action: (
        <Link to="/scan" className={FEATURE_ACTION_CLASS}>
          Open the scanner
          <ActionArrow />
        </Link>
      ),
      vignette: <ScanVignette thumbnailUrls={thumbnailUrls.slice(8, 11)} />,
    },
    {
      id: "collections",
      title: "Track what you own",
      description:
        "Any number of collections: a binder, a deck box, cards lent out. Counts, conditions, languages, and finishes per copy.",
      action: (
        <Link to="/collections" className={FEATURE_ACTION_CLASS}>
          Open your collections
          <ActionArrow />
        </Link>
      ),
      vignette: <CollectionsVignette />,
    },
    {
      id: "lists",
      title: "Lists that maintain themselves",
      description:
        "Wishlists and tradelists driven by rules. Write 'every card missing for a playset' once and the list stays current as your collection changes.",
      action: (
        <Link to="/collections" className={FEATURE_ACTION_CLASS}>
          Open your lists
          <ActionArrow />
        </Link>
      ),
      vignette: <ListsVignette />,
    },
    {
      id: "import",
      title: "Switch in minutes, leave anytime",
      description:
        "Import a Piltover Archive, RiftCore, or RiftMana CSV. Export your whole collection back out whenever you like.",
      action: (
        <Link to="/collections/import" className={FEATURE_ACTION_CLASS}>
          Open import and export
          <ActionArrow />
        </Link>
      ),
      vignette: <ImportVignette />,
    },
    {
      id: "prices",
      title: "Three marketplaces, side by side",
      description:
        "Daily prices from TCGplayer, Cardmarket, and CardTrader on every printing, with price history.",
      action: (
        <Link to="/cards" className={FEATURE_ACTION_CLASS}>
          Open the catalog
          <ActionArrow />
        </Link>
      ),
      vignette: <PricesVignette />,
    },
    {
      id: "promos",
      title: "Every promo, mapped",
      description:
        "Promos grouped by how they were given out, year by year, in every language they were printed in.",
      action: (
        <Link to="/promos" className={FEATURE_ACTION_CLASS}>
          Open the promos
          <ActionArrow />
        </Link>
      ),
      vignette: <PromosVignette thumbnailUrls={thumbnailUrls.slice(14, 18)} />,
    },
    {
      id: "groups",
      title: "Trade inside your playgroup",
      description:
        "Private groups match your wishlist against your friends' spares. Loans track the cards you have lent out and to whom.",
      action: (
        <Link to="/groups" className={FEATURE_ACTION_CLASS}>
          Open your groups
          <ActionArrow />
        </Link>
      ),
      vignette: <GroupsVignette />,
    },
    {
      id: "loans",
      title: "Know where your cards are",
      description:
        "Lend a deck to a friend and stop wondering. Loans track who has what until it comes back.",
      action: (
        <Link to="/loans" className={FEATURE_ACTION_CLASS}>
          Open your loans
          <ActionArrow />
        </Link>
      ),
      vignette: <LoansVignette />,
    },
    {
      id: "decks",
      title: "Deck building with guardrails",
      description:
        "Legality checking against the official rules, or fully freeform. Energy curves, matchup plans, a test bench, and Piltover-compatible deck codes.",
      action: (
        <Link to="/decks" className={FEATURE_ACTION_CLASS}>
          Open your decks
          <ActionArrow />
        </Link>
      ),
      vignette: <DecksVignette />,
    },
    {
      id: "box",
      title: "From decklist to deck box",
      description:
        "Tick cards into the box as you sleeve them. Pick the exact copy to pull, down to the binder it sits in.",
      action: (
        <Link to="/decks" className={FEATURE_ACTION_CLASS}>
          Open your decks
          <ActionArrow />
        </Link>
      ),
      vignette: <BoxVignette />,
    },
    {
      id: "variants",
      title: "One deck, many variants",
      description:
        "Fork a deck to try a change without losing the build that works. Each variant sits on a small graph showing what you added and what you cut.",
      action: (
        <Link to="/decks" className={FEATURE_ACTION_CLASS}>
          Open your decks
          <ActionArrow />
        </Link>
      ),
      vignette: <VariantsVignette />,
    },
    {
      id: "test",
      title: "Test a deck before you sleeve it",
      description:
        "Draw sample hands and exchange the ones you wouldn't keep. The odds table shows every card's chance to be in hand or in the first seven draws.",
      action: (
        <Link to="/decks" className={FEATURE_ACTION_CLASS}>
          Open your decks
          <ActionArrow />
        </Link>
      ),
      vignette: <TestVignette thumbnailUrls={thumbnailUrls.slice(18, 23)} />,
    },
    {
      id: "share",
      title: "Share anything with one link",
      description:
        "Decks, collections, lists, and tier lists share one dialog: the link and its QR on one tab, the export image on the other. Pasted in a chat, the link unfurls into a preview.",
      action: (
        <Link to="/decks" className={FEATURE_ACTION_CLASS}>
          Open your decks
          <ActionArrow />
        </Link>
      ),
      vignette: <ShareVignette />,
    },
    {
      id: "discord",
      title: "A bot for your Discord server",
      description:
        "Type [[card name]] and the bot answers with the card. Slash commands look up decks and rules.",
      action: (
        <a
          href={SOCIAL_LINKS.discordBotInvite}
          target="_blank"
          rel="noreferrer"
          className={FEATURE_ACTION_CLASS}
        >
          Add the bot to your server
          <ActionArrow />
        </a>
      ),
      vignette: <DiscordVignette thumbnailUrl={thumbnailUrls[11]} />,
    },
    {
      id: "tournaments",
      title: "Run the whole tournament",
      description: "Swiss pairings, 2v2, judge tools, and deck checks against the official rules.",
      action: (
        <Link to="/tournaments" className={FEATURE_ACTION_CLASS}>
          Open tournaments
          <ActionArrow />
        </Link>
      ),
      vignette: <TournamentsVignette />,
    },
    {
      id: "stage",
      title: "Put cards on stream",
      description:
        "Queue up cards and show them two ways: a full-screen show for window capture, or a transparent overlay you push cards to in OBS. Tier lists and chat commands complete the creator kit.",
      action: (
        <Link to="/creators" className={FEATURE_ACTION_CLASS}>
          Open the creator tools
          <ActionArrow />
        </Link>
      ),
      vignette: <StageVignette thumbnailUrls={thumbnailUrls.slice(23, 24)} />,
    },
    {
      id: "rules",
      title: "The rules, down to the paragraph",
      description:
        "Every numbered rule, searchable and linked. Find the exact ruling mid-game instead of scrolling a PDF.",
      action: (
        <Link to="/rules" className={FEATURE_ACTION_CLASS}>
          Open the rules
          <ActionArrow />
        </Link>
      ),
      vignette: <RulesVignette />,
    },
    {
      id: "tracker",
      title: "Keep score at the table",
      description:
        "Points and XP for two to four players on one phone, with controls sized for mid-game taps.",
      action: (
        <Link to="/match-tracker" className={FEATURE_ACTION_CLASS}>
          Open the match tracker
          <ActionArrow />
        </Link>
      ),
      vignette: <TrackerVignette thumbnailUrls={thumbnailUrls.slice(12, 14)} />,
    },
  ];

  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarTitle>Features</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_PADDING_NO_TOP, "mx-auto w-full max-w-5xl pt-3")}>
        <PageDescription>
          Everything OpenRift does, in one place. Jump to a feature or scroll the lot.
        </PageDescription>
        <div className="mt-6">
          <TableOfContents />
        </div>
        <div className="divide-border/60 flex flex-col divide-y">
          {sections.map((section, index) => (
            <FeatureSection key={section.id} {...section} flip={index % 2 === 1} />
          ))}
          <Toolbox />
          <ClosingBlock signedOut={!isPending && !session?.user} />
        </div>
      </div>
    </>
  );
}
