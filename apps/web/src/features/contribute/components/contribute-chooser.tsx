import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRightIcon,
  ImagePlusIcon,
  LayersIcon,
  PencilLineIcon,
  PlusIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { ContributeHero } from "@/features/contribute/components/contribute-hero";
import { MyMissingImagesSection } from "@/features/contribute/components/my-missing-images-section";
import { YourSubmissionsCard } from "@/features/contribute/components/your-submissions-card";
import { cornerClip } from "@/features/marketing/components/clip-frame";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

const CTA_CLIP = cornerClip(12);

const STEPS = [
  { title: "You send it in", description: "Fill in what you know. Partial is fine." },
  {
    title: "We review it",
    description: "Usually within a few days. Partial data is fine, we fill in the rest.",
  },
  { title: "It goes live", description: "The card, printing or image shows up for everyone." },
] as const;

export function ContributeChooser() {
  return (
    <div className="flex flex-col gap-8">
      <ContributeHero
        title="Help us fill in the gaps"
        lead="The card data on OpenRift is kept up by one person. A missing printing, a typo, a photo of a card you have in hand: everything you send is reviewed and then shows up for everyone."
        action={
          <Link
            to="/contribute/image"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring font-heading mt-2 inline-flex h-11 items-center px-7 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            style={{ clipPath: CTA_CLIP }}
          >
            Add a missing image
          </Link>
        }
      />

      <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING_NO_TOP, "flex flex-col gap-8")}>
        <MyMissingImagesSection layout="tiles" />

        <section className="flex flex-col gap-3">
          <Heading level={2}>Four ways to help</Heading>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceTile
              to="/contribute/card"
              icon={PlusIcon}
              title="Add a card we don't have"
              description="A card that is missing from OpenRift entirely."
              needs="the name and the code"
            />
            <ChoiceTile
              to="/contribute/printing"
              icon={LayersIcon}
              title="Add a printing of a card we have"
              description="Another version of a card we already list: a foil, a promo, another language."
              needs="the card and its finish"
            />
            <ChoiceTile
              to="/contribute/image"
              icon={ImagePlusIcon}
              title="Add a missing image"
              description="Some printings still show a placeholder. We straighten and crop it for you."
              needs="a phone photo"
            />
            <ChoiceTile
              to="/contribute/fix"
              icon={PencilLineIcon}
              title="Fix something on a card"
              description="Wrong text, a missing keyword, a code that doesn't match."
              needs="the card and the correction"
            />
          </div>
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <Heading level={2}>What happens next</Heading>
            <ol className="flex flex-col gap-3.5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span className="bg-primary text-primary-foreground font-heading flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {index + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{step.title}</span>
                    <span className="text-muted-foreground text-sm">{step.description}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <YourSubmissionsCard className="lg:mt-10" />
        </section>
      </div>
    </div>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="bg-muted text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
      <Icon className="size-5" />
    </span>
  );
}

function ChoiceTile({
  to,
  icon,
  title,
  description,
  needs,
}: {
  to: "/contribute/card" | "/contribute/printing" | "/contribute/image" | "/contribute/fix";
  icon: LucideIcon;
  title: string;
  description: string;
  needs: ReactNode;
}) {
  return (
    <CardLink render={<Link to={to} />}>
      <CardContent className="flex gap-3.5">
        <IconTile icon={icon} />
        <div className="flex flex-1 flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <span className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
            <Badge variant="secondary">Needs</Badge>
            {needs}
          </span>
        </div>
        <ChevronRightIcon className="text-muted-foreground size-4 self-center" />
      </CardContent>
    </CardLink>
  );
}
