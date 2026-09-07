import type { CSSProperties } from "react";

import { PageToc, PageTocMobileTrigger } from "@/components/layout/page-toc";
import type { PageTocItem } from "@/components/layout/page-toc";
import { PageDescription, usePageTopBarHeight } from "@/components/layout/page-top-bar";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { PAGE_WIDTH, cn } from "@/lib/utils";

import { BadgesChipsSection } from "./badges-chips-section";
import { BrandGlyphSection } from "./brand-glyph-section";
import { ButtonsSection } from "./buttons-section";
import { CardThumbnailsSection } from "./card-thumbnails-section";
import { CompositesSection } from "./composites-section";
import { FeedbackSection } from "./feedback-section";
import { FormControlsSection } from "./form-controls-section";
import { IconChipSection } from "./icon-chip-section";
import { LayoutSection } from "./layout-section";
import { MetaArchiveSection } from "./meta-archive-section";
import { OrnamentsSection } from "./ornaments-section";
import { OverlaysSection } from "./overlays-section";
import { PickersSection } from "./pickers-section";
import { PressableSection } from "./pressable-section";
import { QrCodesSection } from "./qr-codes-section";
import { SectionHeadingSection } from "./section-heading-section";
import { TilesSection } from "./tiles-section";
import { TogglesSection } from "./toggles-section";
import { TokensSection } from "./tokens-section";
import { TopBarButtonsSection } from "./top-bar-buttons-section";

const SECTIONS = [
  { id: "tokens", title: "Tokens", Component: TokensSection },
  { id: "buttons", title: "Buttons", Component: ButtonsSection },
  { id: "top-bar-buttons", title: "Top-bar buttons", Component: TopBarButtonsSection },
  { id: "toggles", title: "Toggles", Component: TogglesSection },
  { id: "badges-chips", title: "Badges & chips", Component: BadgesChipsSection },
  { id: "pressable", title: "Pressable & disclosure", Component: PressableSection },
  { id: "section-heading", title: "Section heading", Component: SectionHeadingSection },
  { id: "ornaments", title: "Ornaments", Component: OrnamentsSection },
  { id: "icon-chip", title: "Icon chip", Component: IconChipSection },
  { id: "brand-glyph", title: "Brand glyph", Component: BrandGlyphSection },
  { id: "qr-codes", title: "Copy rows & QR codes", Component: QrCodesSection },
  { id: "tiles", title: "Tiles", Component: TilesSection },
  { id: "card-thumbnails", title: "Card thumbnails", Component: CardThumbnailsSection },
  { id: "form-controls", title: "Form controls", Component: FormControlsSection },
  { id: "pickers", title: "Pickers & commands", Component: PickersSection },
  { id: "overlays", title: "Overlays", Component: OverlaysSection },
  { id: "feedback", title: "Feedback & status", Component: FeedbackSection },
  { id: "layout", title: "Layout & data", Component: LayoutSection },
  { id: "meta-archive", title: "Meta archive", Component: MetaArchiveSection },
  { id: "composites", title: "Composites", Component: CompositesSection },
] as const;

const TOC_ITEMS: PageTocItem[] = SECTIONS.map((section) => ({
  id: section.id,
  label: section.title,
}));

export function DesignPage() {
  const topBarHeight = usePageTopBarHeight();

  return (
    <div
      className={cn(PAGE_WIDTH.capped, "flex gap-6 pb-16")}
      style={
        { "--sticky-top": `calc(var(--header-height) + ${topBarHeight}px + 1rem)` } as CSSProperties
      }
    >
      <AdminPageTopBar title="Design" />
      <PageToc items={TOC_ITEMS} />
      <div className="flex min-w-0 flex-1 flex-col gap-10">
        <div className="flex items-start gap-3">
          <PageDescription>
            Check both themes with the header toggle. Spec captions are measured live from the
            rendered DOM.
          </PageDescription>
          <PageTocMobileTrigger items={TOC_ITEMS} className="ml-auto shrink-0" />
        </div>

        {SECTIONS.map((section) => (
          <section.Component key={section.id} />
        ))}
      </div>
    </div>
  );
}
