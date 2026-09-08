import { useSuspenseQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import { buildChannelTree, leafChannels } from "@/features/cards/lib/distribution-channel-tree";
import { PrintingCard } from "@/features/contribute/components/contribute-printing-card";
import type { ContributeFormApi } from "@/features/contribute/hooks/use-contribute-form";
import { toVariantLabelPrinting } from "@/features/contribute/lib/contribute-printing-labels";
import {
  useChannelRegistry,
  useEnumOrders,
  useLanguageList,
  useMarkerList,
} from "@/hooks/use-enums";

type ContributePrintingsSectionProps = Pick<
  ContributeFormApi,
  | "form"
  | "activePrinting"
  | "printingsWithErrors"
  | "errorAt"
  | "setActivePrinting"
  | "setPrintingField"
  | "addPrinting"
  | "duplicatePrinting"
  | "removePrinting"
>;

export function ContributePrintingsSection({
  form,
  activePrinting,
  printingsWithErrors,
  errorAt,
  setActivePrinting,
  setPrintingField,
  addPrinting,
  duplicatePrinting,
  removePrinting,
}: ContributePrintingsSectionProps) {
  const { orders, labels } = useEnumOrders();
  const languages = useLanguageList();
  const markerOptions = useMarkerList();
  const channelOptions = leafChannels(buildChannelTree(useChannelRegistry())).map((node) => ({
    slug: node.channel.slug,
    label: node.breadcrumb,
  }));
  const { data: setListData } = useSuspenseQuery(publicSetListQueryOptions);

  const markerLabels = Object.fromEntries(markerOptions.map((m) => [m.slug, m.label]));
  const printingVariants = form.printings.map((p) => toVariantLabelPrinting(p, markerLabels));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Heading level={2}>Printings</Heading>
        <Button type="button" variant="outline" size="sm" onClick={addPrinting}>
          <PlusIcon className="size-4" />
          Add printing
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {form.printings.map((printing, index) => (
          <PrintingCard
            key={index}
            index={index}
            printing={printing}
            variant={printingVariants[index]}
            siblings={printingVariants}
            open={index === activePrinting}
            hasError={printingsWithErrors.has(index)}
            onToggle={() => setActivePrinting(index === activePrinting ? null : index)}
            errorAt={errorAt}
            sets={setListData.sets}
            languages={languages}
            markers={markerOptions}
            channels={channelOptions}
            orders={orders}
            labels={labels}
            onChange={(key, value) => setPrintingField(index, key, value)}
            onCopy={() => duplicatePrinting(index)}
            onRemove={form.printings.length > 1 ? () => removePrinting(index) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
