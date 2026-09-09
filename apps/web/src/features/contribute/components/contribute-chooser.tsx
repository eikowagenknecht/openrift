import { Link, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ImagePlusIcon, LayersIcon, PencilLineIcon, PlusIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { CardSlugPicker } from "@/features/contribute/components/card-slug-picker";
import { MyMissingImagesSection } from "@/features/contribute/components/my-missing-images-section";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export function ContributeChooser() {
  const navigate = useNavigate();

  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-6")}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Heading level={1}>Add a card to OpenRift</Heading>
          <Button variant="outline" size="sm" render={<Link to="/contribute/submissions" />}>
            My submissions
          </Button>
        </div>
        <p className="text-muted-foreground">
          Spotted a missing printing or a typo? Any help is appreciated!
        </p>
      </header>

      <MyMissingImagesSection />

      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceTile
          to="/contribute/card"
          icon={PlusIcon}
          title="Add a card we don't have"
          description="A card that is missing from OpenRift entirely. The name and the code are enough to start."
        />
        <ChoiceTile
          to="/contribute/printing"
          icon={LayersIcon}
          title="Add a printing of a card we have"
          description="Another version of a card we already list, like a foil, a promo, or another language."
        />
        <ChoiceTile
          to="/contribute/image"
          icon={ImagePlusIcon}
          title="Add a missing image"
          description="Some printings still show a placeholder. A phone photo is enough, we handle the rest."
        />
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PencilLineIcon className="text-muted-foreground size-4" />
              Fix something on a card
            </CardTitle>
            <CardDescription>
              Wrong text, a missing keyword, a code that doesn&apos;t match. Pick the card and edit
              what is off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardSlugPicker
              label="Pick a card to fix"
              onPick={(cardSlug) =>
                void navigate({ to: "/contribute/card/$cardSlug", params: { cardSlug } })
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChoiceTile({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: "/contribute/card" | "/contribute/printing" | "/contribute/image";
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <CardLink render={<Link to={to} />} size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </CardLink>
  );
}
