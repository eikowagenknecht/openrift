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
          Fast. Free. No ads. Open source.
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
          title: "All the cards, easy to browse",
          description:
            "OpenRift aims to have all cards and promos catalogued in all available languages. Currently that means English, Chinese, French, and Korean printings and around 800 promos. We have exhaustive filtering and sorting options, so you can easily find the cards you're looking for.",
          action: sectionAction("Open the catalog", "/cards"),
          vignette: <CatalogVignette thumbnails={taggedThumbnails} cardCount={data?.cardCount} />,
        },
        {
          id: "scan",
          title: "Scan cards with your phone",
          description:
            "Look up prices or add cards to your collection by just pointing your camera at them. The scanner works offline, is not fooled easily by bad lighting, and takes less than a second to recognize cards on modern phones. Works with desktop webcams as well. No usage limits and completely free.",
          action: sectionAction("Open the scanner", "/scan"),
          vignette: <ScanVignette cards={thumbnailCards.slice(8, 12)} />,
          emphasis: true,
          flip: true,
        },
        {
          id: "collections",
          title: "Unlimited collections, organized your way",
          description:
            "Create as many as you like: binders, storage drawers, shoe boxes, deck boxes. View them separately, or all together. Never lose track of where you put that card again.",
          action: sectionAction("Open collections", "/collections"),
          vignette: <CollectionsVignette thumbnailUrls={thumbnailUrls.slice(4, 7)} />,
        },
        {
          id: "import",
          title: "Import from anywhere, export anytime",
          description:
            "Moving in from another tool, or just want to try things out? You can start your OpenRift collection by pasting a plain text list or uploading a CSV from Piltover Archive, RiftCore, or RiftMana. Nothing to convert, nothing to retype. If you ever want to leave, you can export your collection back to those formats (and more).",
          action: sectionAction("Import now", "/collections/import"),
          vignette: <ImportVignette />,
          flip: true,
        },
        {
          id: "lists",
          title: "Lists that maintain themselves",
          description:
            'Fill a list by hand, by rule, or both. A rule is the card browser\'s entire filter language pointed at a list, and every dimension can exclude as well as include. A rule could be "A playset of every Origins printing I\'m still missing, in English, no metal printings". Lists can combine multiple rules as well. Tradelists run the same machinery in reverse, e.g. "Keep three of each card and offer the surplus."',
          action: sectionAction("Open your lists", "/collections"),
          vignette: <ListsVignette />,
        },
      ],
      cards: [
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
          title: "Every promo stamp, every source",
          description:
            "Stamps like Promo, Judge and Prerelease are tracked per printing. Where the card was handed out is a separate axis, a channel tree four levels deep. You can group the page by either.",
          action: sectionAction("See all promos", "/promos"),
          vignette: <PromosVignette sections={data?.promoSections} />,
        },
      ],
    },
    {
      chapterId: "build",
      fulls: [
        {
          id: "decks",
          title: "Deck building, strict or freeform",
          description:
            "Legality checked against the official rules as you build, or switched off entirely. Energy curves, matchup plans, and deck codes that other tools can read.",
          action: sectionAction("Build a deck", "/decks"),
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
            "Deal sample opening hands and try the mulligan. The odds table gives every card's chance of landing in the opening four, and anywhere in your first seven.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <TestVignette thumbnailUrls={thumbnailUrls.slice(18, 23)} />,
        },
        {
          id: "box",
          title: "From decklist to deck box",
          description:
            "Link a deck to the box you keep it in, then tick each card off as it goes in. Missing and surplus are counted for you, and each row names which copy to pull and which collection it's sitting in.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <BoxVignette />,
        },
      ],
    },
    {
      chapterId: "play",
      fulls: [
        {
          id: "tournaments",
          title: "From pod night to store event",
          description:
            "Swiss pairings for 1v1, pods for three or four players, and fixed teams for 2v2. Deck submission, judges, and deck checks are optional per tournament. Players report their own results from a link, and spectators can follow the standings.",
          action: sectionAction("Open tournaments", "/tournaments"),
          vignette: <TournamentsVignette />,
        },
      ],
      cards: [
        {
          id: "rules",
          title: "The rules, down to the paragraph",
          description:
            "Every core and tournament rule, filtered as you type. Game terms and cross-references are jump links, so you land on the exact ruling instead of scrolling a PDF. Older versions stay online with the changes since the last one marked up.",
          action: sectionAction("Open the rules", "/rules"),
          vignette: <RulesVignette />,
        },
        {
          id: "tracker",
          title: "Keep score at the table",
          description: "Track points and XP in 1v1, 2v2 and FFA games, on one phone.",
          action: sectionAction("Open the match tracker", "/match-tracker"),
          vignette: <TrackerVignette thumbnailUrls={thumbnailUrls.slice(12, 14)} />,
        },
      ],
    },
    {
      chapterId: "community",
      fulls: [
        {
          id: "groups",
          title: "Trade inside your playgroup",
          description:
            "Private groups match your wishlist against everyone's spares and show you which trades are possible. Each member page tracks whose move it is, what you have already traded, and which lists they share with you.",
          action: sectionAction("Open your groups", "/groups"),
          vignette: <GroupsVignette />,
          flip: true,
        },
      ],
      cards: [
        {
          id: "loans",
          title: "Know where your cards are",
          description:
            "Lend cards to a friend and mark them returned when they come back. A lent copy stays in your collection, flagged as on loan, and stops counting for deck building and trades until it's back.",
          action: sectionAction("Open your loans", "/loans"),
          vignette: <LoansVignette />,
        },
        {
          id: "share",
          title: "Share anything with one link",
          description:
            "Paste a deck link into a chat and it turns into a preview with the cards, the format, and who built it. Decks, collections, lists, and tier lists all work this way. Download the image for a post or a vertical story, up to 4K, free.",
          action: sectionAction("Open your decks", "/decks"),
          vignette: <ShareVignette />,
        },
        {
          id: "discord",
          title: "A bot for your Discord server",
          description:
            "Type [[card name]] and the bot replies with the art, prices from all three marketplaces, and a link. Link the server to your group and it also shows who there has the card on their tradelist. Slash commands unfurl deck codes and find rulings.",
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
          vignette: <DiscordVignette card={thumbnailCards[14]} />,
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
            "Queue up cards and show them two ways: a full-screen view for window capture, or a transparent overlay you paste into OBS as a browser source. Viewers can look up cards in chat with !card, and tier lists rank a set on a board you can share as a link or an image.",
          action: sectionAction("Open the creator tools", "/creators"),
          vignette: <StageVignette thumbnailUrls={thumbnailUrls.slice(23, 24)} />,
        },
      ],
      cards: [
        {
          id: "designer",
          title: "Design your own cards",
          description:
            "Fill in the name, type, domains, stats, and rules text, add your own art, and the card renders as you type. Download it as a PNG or copy it straight to the clipboard.",
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
