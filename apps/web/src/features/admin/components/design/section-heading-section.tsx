import { BellIcon, HeartIcon } from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";

import { DemoRow, DemoSection } from "./demo-primitives";

export function SectionHeadingSection() {
  return (
    <DemoSection
      id="section-heading"
      title="Section heading"
      note="The app's in-page section heading: a small uppercase muted label, optionally followed by a tabular count. size=sm is the quieter sub-group variant; variant=display is the heading-face form for hero-led pages."
    >
      <DemoRow label="Default size">
        <div className="w-full space-y-4">
          <SectionHeading>Cards in collection</SectionHeading>
          <SectionHeading count={12}>Cards with prices</SectionHeading>
        </div>
      </DemoRow>
      <DemoRow label="Display variant">
        <div className="w-full space-y-4">
          <SectionHeading variant="display">Also coming up</SectionHeading>
          <SectionHeading variant="display" count={7}>
            Past events
          </SectionHeading>
        </div>
      </DemoRow>
      <DemoRow label="Small size">
        <div className="w-full space-y-3">
          <SectionHeading size="sm">Yesterday</SectionHeading>
          <SectionHeading size="sm" count={3}>
            Today
          </SectionHeading>
        </div>
      </DemoRow>
      <DemoRow label="With icon chip">
        <div className="w-full space-y-3">
          <SectionHeading icon={BellIcon} tone="gold" count={2}>
            Action needed
          </SectionHeading>
          <SectionHeading icon={HeartIcon} tone="info" count={5}>
            Wishlists &amp; tradelists
          </SectionHeading>
        </div>
      </DemoRow>
    </DemoSection>
  );
}
