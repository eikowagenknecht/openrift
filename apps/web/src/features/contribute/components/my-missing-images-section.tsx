import { Heading } from "@/components/heading";
import { MissingImagesList } from "@/features/contribute/components/missing-images-list";
import { useMyMissingImages } from "@/features/contribute/hooks/use-missing-images";

export function MyMissingImagesSection() {
  const { data } = useMyMissingImages();

  const items = data?.items ?? [];
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <Heading level={2}>Cards you own that have no image</Heading>
      <p className="text-muted-foreground">
        You have these in hand, so a quick phone photo from you is the fastest way to fill the gap.
      </p>
      <MissingImagesList items={items} />
    </section>
  );
}
