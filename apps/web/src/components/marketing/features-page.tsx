import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { siGithub } from "simple-icons";

import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarHeightContext,
  PageTopBarSticky,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { useSession } from "@/lib/auth-session";
import { landingSummaryQueryOptions } from "@/lib/landing-summary-query";
import { landingThumbnailCards } from "@/lib/landing-thumbnails";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

import { BoxVignette } from "./box-vignette";
import { ChapterDivider } from "./chapter-divider";
import { cornerClip } from "./clip-frame";
import { DesignerVignette } from "./designer-vignette";
import { FeatureCard } from "./feature-card";
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
import { FEATURE_CHAPTERS } from "./features-chapters";
import { FeaturesHero } from "./features-hero";
import { FeaturesChipNav, FeaturesRail } from "./features-nav";
import { LoansVignette } from "./loans-vignette";
import { ProductsVignette } from "./products-vignette";
import { PromosVignette } from "./promos-vignette";
import { Reveal } from "./reveal";
import { RulesVignette } from "./rules-vignette";
import { ScanVignette } from "./scan-vignette";
import { ShareVignette } from "./share-vignette";
import { StageVignette } from "./stage-vignette";
import { TestVignette } from "./test-vignette";
import { TrackerVignette } from "./tracker-vignette";
import { VariantsVignette } from "./variants-vignette";

const CTA_CUT = 12;

interface FullSectionDef {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  vignette: ReactNode;
  emphasis?: boolean;
  /** Alternates left/right across ALL full sections, so set per section. */
  flip?: boolean;
}

interface CardSectionDef {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  vignette?: ReactNode;
}

interface ChapterContent {
  chapterId: string;
  fulls: FullSectionDef[];
  cards: CardSectionDef[];
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
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const thumbnailUrls = (data?.thumbnailIds ?? []).map((id) => imageUrl(id, "400w"));
  const taggedThumbnails = (data?.thumbnails ?? []).map((thumb) => ({
    url: imageUrl(thumb.imageId, "400w"),
    rarity: thumb.rarity,
    domains: thumb.domains,
  }));
  const thumbnailCards = landingThumbnailCards(data?.thumbnails);

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

  function sectionAction(label: string, to: string): ReactNode {
    return (
      <Link to={to} className={FEATURE_ACTION_CLASS}>
        {label}
        <ActionArrow />
      </Link>
    );
  }

  const chapters: ChapterContent[] = [
    {
      chapterId: "collect",
      fulls: [
        {
          id: "catalog",
          title: "Every card, every printing",
          description:
            "The whole catalog: English, Chinese, French, and Korean printings, promos included. Filter by set, rarity, domain, finish, or language, and search full card text.",
          action: sectionAction("Open the catalog", "/cards"),
          vignette: <CatalogVignette thumbnails={taggedThumbnails} cardCount={data?.cardCount} />,
        },
        {
          id: "scan",
          title: "Scan cards with your camera",
          description:
            "The scanner recognizes the exact printing, not just the name. Add a whole box to your collection in one sitting.",
          action: sectionAction("Open the scanner", "/scan"),
          vignette: <ScanVignette cards={thumbnailCards.slice(8, 11)} />,
          emphasis: true,
          flip: true,
        },
        {
          id: "collections",
          title: "Track what you own",
          description:
            "Any number of collections: a binder, a deck box, cards lent out. Counts, conditions, languages, and finishes per copy.",
          action: sectionAction("Open your collections", "/collections"),
          vignette: <CollectionsVignette />,
        },
      ],
      cards: [
        {
          id: "lists",
          title: "Lists that maintain themselves",
          description:
            "Wishlists and tradelists driven by rules. Write 'every card missing for a playset' once and the list stays current as your collection changes.",
          action: sectionAction("Open your lists", "/collections"),
          vignette: <ListsVignette />,
        },
        {
          id: "import",
          title: "Switch in minutes, leave anytime",
          description:
            "Import a Piltover Archive, RiftCore, or RiftMana CSV. Export your whole collection back out whenever you like.",
          action: sectionAction("Open import and export", "/collections/import"),
          vignette: <ImportVignette />,
        },
        {
          id: "prices",
          title: "Three marketplaces, side by side",
          description:
            "Daily prices from TCGplayer, Cardmarket, and CardTrader on every printing, with price history.",
          action: sectionAction("Open the catalog", "/cards"),
          vignette: <PricesVignette />,
        },
        {
          id: "promos",
          title: "Every promo, mapped",
          description:
            "Promos grouped by how they were given out, year by year, in every language they were printed in.",
          action: sectionAction("Open the promos", "/promos"),
          vignette: <PromosVignette sections={data?.promoSections} />,
        },
        {
          id: "products",
          title: "Every sealed product",
          description: "Boosters, bundles, and starter decks, with what's inside each one.",
          action: sectionAction("Open the products", "/products"),
          vignette: <ProductsVignette />,
        },
      ],
    },
    {
      chapterId: "build",
      fulls: [
        {
          id: "decks",
          title: "Deck building with guardrails",
          description:
            "Legality checking against the official rules, or fully freeform. Energy curves, matchup plans, a test bench, and Piltover-compatible deck codes.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <DecksVignette />,
          flip: true,
        },
      ],
      cards: [
        {
          id: "variants",
          title: "One deck, many variants",
          description:
            "Fork a deck to try a change without losing the build that works. Each variant sits on a small graph showing what you added and what you cut.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <VariantsVignette />,
        },
        {
          id: "test",
          title: "Test a deck before you sleeve it",
          description:
            "Draw sample hands and exchange the ones you wouldn't keep. The odds table shows every card's chance to be in hand or in the first seven draws.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <TestVignette thumbnailUrls={thumbnailUrls.slice(18, 23)} />,
        },
        {
          id: "box",
          title: "From decklist to deck box",
          description:
            "Tick cards into the box as you sleeve them. Pick the exact copy to pull, down to the binder it sits in.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <BoxVignette />,
        },
      ],
    },
    {
      chapterId: "together",
      fulls: [
        {
          id: "groups",
          title: "Trade inside your playgroup",
          description:
            "Private groups match your wishlist against your friends' spares. Loans track the cards you have lent out and to whom.",
          action: sectionAction("Open your groups", "/groups"),
          vignette: <GroupsVignette />,
        },
      ],
      cards: [
        {
          id: "loans",
          title: "Know where your cards are",
          description:
            "Lend a deck to a friend and stop wondering. Loans track who has what until it comes back.",
          action: sectionAction("Open your loans", "/loans"),
          vignette: <LoansVignette />,
        },
        {
          id: "share",
          title: "Share anything with one link",
          description:
            "Decks, collections, lists, and tier lists share one dialog: the link and its QR on one tab, the export image on the other. Pasted in a chat, the link unfurls into a preview.",
          action: sectionAction("Open your decks", "/decks"),
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
      ],
    },
    {
      chapterId: "table",
      fulls: [
        {
          id: "tournaments",
          title: "Run the whole tournament",
          description:
            "Swiss pairings, 2v2, judge tools, and deck checks against the official rules.",
          action: sectionAction("Open tournaments", "/tournaments"),
          vignette: <TournamentsVignette />,
          flip: true,
        },
      ],
      cards: [
        {
          id: "rules",
          title: "The rules, down to the paragraph",
          description:
            "Every numbered rule, searchable and linked. Find the exact ruling mid-game instead of scrolling a PDF.",
          action: sectionAction("Open the rules", "/rules"),
          vignette: <RulesVignette />,
        },
        {
          id: "tracker",
          title: "Keep score at the table",
          description:
            "Points and XP for two to four players on one phone, with controls sized for mid-game taps.",
          action: sectionAction("Open the match tracker", "/match-tracker"),
          vignette: <TrackerVignette thumbnailUrls={thumbnailUrls.slice(12, 14)} />,
        },
      ],
    },
    {
      chapterId: "create",
      fulls: [
        {
          id: "stage",
          title: "Put cards on stream",
          description:
            "Queue up cards and show them two ways: a full-screen show for window capture, or a transparent overlay you push cards to in OBS. Tier lists and chat commands complete the creator kit.",
          action: sectionAction("Open the creator tools", "/creators"),
          vignette: <StageVignette thumbnailUrls={thumbnailUrls.slice(23, 24)} />,
        },
      ],
      cards: [
        {
          id: "designer",
          title: "Design your own cards",
          description: "Put your own art, stats, and text on a real card frame.",
          action: sectionAction("Open the card designer", "/card-designer"),
          vignette: <DesignerVignette />,
        },
      ],
    },
  ];

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <PageTopBarSticky maxWidth="5xl" ref={setTopBarSlot}>
        <PageTopBar>
          <PageTopBarTitle>Features</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <FeaturesChipNav chapters={FEATURE_CHAPTERS} />
      <FeaturesRail chapters={FEATURE_CHAPTERS} />
      <FeaturesHero chapters={FEATURE_CHAPTERS} thumbnailUrls={thumbnailUrls.slice(0, 5)} />
      <div className={cn(PAGE_PADDING_NO_TOP, "mx-auto w-full max-w-5xl")}>
        {chapters.map((content) => {
          const chapter = FEATURE_CHAPTERS.find((entry) => entry.id === content.chapterId);
          if (!chapter) {
            return null;
          }
          return (
            <div key={chapter.id}>
              <ChapterDivider chapter={chapter} />
              {content.fulls.map((section) => (
                <FeatureSection key={section.id} {...section} />
              ))}
              {content.cards.length > 0 && (
                <div className="grid gap-6 pt-2 pb-12 sm:grid-cols-2 sm:gap-8 sm:pb-16">
                  {content.cards.map((card) => (
                    <FeatureCard key={card.id} {...card} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="border-border/60 border-t">
          <ClosingBlock signedOut={!isPending && !session?.user} />
        </div>
      </div>
    </PageTopBarHeightContext>
  );
}
