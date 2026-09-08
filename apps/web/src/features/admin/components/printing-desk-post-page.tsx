import type { DeskImage, DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { enumLabel } from "@openrift/shared/enum-label";
import { formatPrintingCode } from "@openrift/shared/printing-code";
import { buildPrintingsPostCaption } from "@openrift/shared/printing-post-caption";
import {
  formatPostDate,
  isPostDayDate,
  releasePostDate,
} from "@openrift/shared/printing-post-date";
import type { PostImageAspect, PostImageLabel } from "@openrift/shared/printing-post-image";
import {
  POST_IMAGE_ASPECTS,
  POST_IMAGE_LABEL_TEXT,
  POST_IMAGE_LABELS,
} from "@openrift/shared/printing-post-image";
import { todayUtc } from "@openrift/shared/set-release";
import { getOrientation } from "@openrift/shared/utils";
import { useSuspenseQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageTopBarBack } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { DeskSegmented } from "@/features/admin/components/printing-desk-shared";
import { deskPrintingQueryOptions } from "@/features/admin/hooks/use-printing-desk";
import { printingDeskCardUrl } from "@/features/admin/lib/printing-desk-csv";
import { deskImageSrc } from "@/features/admin/lib/printing-desk-image";
import { deskPrintingRelease, deskPrintingStatus } from "@/features/admin/lib/printing-desk-status";
import { effectivePostDate, POST_DATE_NONE } from "@/features/admin/lib/printing-post-date-default";
import {
  POST_IMAGE_PREVIEW_WIDTH,
  postImagePreviewCaption,
  printingPostImageFilename,
  printingPostImageUrl,
} from "@/features/admin/lib/printing-post-image-url";
import type { PostSlide } from "@/features/admin/lib/printing-post-slides";
import {
  addSlide,
  encodePostSlides,
  moveSlide,
  removeSlide,
} from "@/features/admin/lib/printing-post-slides";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarkers } from "@/hooks/use-markers";
import { downloadImageFromUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const LABEL_OPTIONS = POST_IMAGE_LABELS.map((label) => ({
  value: label,
  label: POST_IMAGE_LABEL_TEXT[label],
}));

const ASPECT_OPTIONS = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait 4:5" },
  { value: "story", label: "Story 9:16" },
] as const satisfies readonly { value: PostImageAspect; label: string }[];

const FACE_TEXT: Record<DeskImage["face"], string> = {
  front: "Front",
  back: "Back",
};

interface PrintingDeskPostPageProps {
  slides: readonly PostSlide[];
  label?: PostImageLabel;
  aspect?: PostImageAspect;
  date?: string;
}

interface SlideEntry {
  slide: PostSlide;
  printing: DeskPrintingRow;
  image: DeskImage | null;
}

interface DownloadItem {
  url: string;
  filename: string;
}

async function downloadSequentially(items: readonly DownloadItem[]): Promise<void> {
  for (const item of items) {
    await downloadImageFromUrl(item.url, item.filename);
  }
}

export function PrintingDeskPostPage({ slides, label, aspect, date }: PrintingDeskPostPageProps) {
  const printingIds = new Set(slides.map((slide) => slide.printingId));
  const onlyPrintingId = printingIds.size === 1 ? slides[0]?.printingId : undefined;
  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Make a post"
        back={
          onlyPrintingId ? (
            <PageTopBarBack
              to="/admin/printing-desk/printings/$printingId"
              params={{ printingId: onlyPrintingId }}
            />
          ) : (
            <PageTopBarBack to="/admin/printing-desk" />
          )
        }
      />
      {slides.length === 0 ? (
        <NoSlides />
      ) : (
        <PostComposer slides={slides} label={label} aspect={aspect} date={date} />
      )}
    </div>
  );
}

function NoSlides() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ImageIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing to post yet</EmptyTitle>
        <EmptyDescription>
          Tick the printings you want on the desk and choose “Make a post”, or open one printing and
          start from its image.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/admin/printing-desk" />}>
          Back to your printings
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function PostComposer({
  slides,
  label: labelParam,
  aspect: aspectParam,
  date: dateParam,
}: PrintingDeskPostPageProps) {
  const navigate = useNavigate();
  const { data: channelData } = useDistributionChannels();
  const { data: markerData } = useMarkers();
  const { labels } = useEnumOrders();
  const { copied, copy } = useCopyToClipboard();

  const printingIds = [...new Set(slides.map((slide) => slide.printingId))];
  const results = useSuspenseQueries({
    queries: printingIds.map((printingId) => deskPrintingQueryOptions(printingId)),
  });

  const [selected, setSelected] = useState(0);
  const [showCredit, setShowCredit] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const dataByPrinting = new Map(
    printingIds.map((printingId, position) => [printingId, results[position]?.data]),
  );
  const markerLabelBySlug = new Map(
    markerData.markers.map((marker) => [marker.slug, marker.label]),
  );

  const entries: SlideEntry[] = slides.flatMap((slide) => {
    const data = dataByPrinting.get(slide.printingId);
    if (data === undefined) {
      return [];
    }
    return [
      {
        slide,
        printing: data.printing,
        image: data.images.find((image) => image.imageFileId === slide.imageFileId) ?? null,
      },
    ];
  });

  const candidates = printingIds.flatMap((printingId) => {
    const data = dataByPrinting.get(printingId);
    if (data === undefined) {
      return [];
    }
    return data.images
      .filter(
        (image) =>
          !slides.some(
            (slide) => slide.printingId === printingId && slide.imageFileId === image.imageFileId,
          ),
      )
      .map((image) => ({ printing: data.printing, image }));
  });

  const index = Math.min(selected, entries.length - 1);
  const current = entries.at(index);
  const label = labelParam ?? (current ? deskPrintingStatus(current.printing) : "announced");
  const aspect = aspectParam ?? "square";
  const { w, h } = POST_IMAGE_ASPECTS[aspect];
  const firstEntry = entries.at(0);
  const firstRelease = firstEntry ? deskPrintingRelease(firstEntry.printing) : undefined;
  const releaseDate = firstRelease ? releasePostDate(firstRelease) : undefined;
  const announcedDate = firstEntry?.printing.announcedAt ?? null;
  const postDate = effectivePostDate(dateParam, label, firstRelease, announcedDate);
  const postDayValue = postDate !== undefined && isPostDayDate(postDate) ? postDate : null;

  function landscapeFor(printing: DeskPrintingRow): boolean {
    return getOrientation([printing.cardType]) === "landscape";
  }

  function channelLabelFor(printing: DeskPrintingRow): string | null {
    return (
      channelData.distributionChannels.find(
        (channel) => channel.slug === printing.distributionChannelSlugs.at(0),
      )?.label ?? null
    );
  }

  function goTo(next: {
    slides?: readonly PostSlide[];
    label?: PostImageLabel;
    aspect?: PostImageAspect;
    date?: string;
  }) {
    void navigate({
      to: "/admin/printing-desk/post",
      search: {
        slides: encodePostSlides(next.slides ?? slides),
        label: next.label ?? label,
        aspect: next.aspect ?? aspect,
        date: next.date ?? dateParam,
      },
      replace: true,
    });
  }

  function move(from: number, to: number) {
    goTo({ slides: moveSlide(slides, from, to) });
    if (from === index) {
      setSelected(to);
    }
  }

  function drop(position: number) {
    goTo({ slides: removeSlide(slides, position) });
  }

  function add(slide: PostSlide) {
    goTo({ slides: addSlide(slides, slide) });
    setAddOpen(false);
  }

  const downloadItems: DownloadItem[] = entries.map((entry, position) => ({
    url: printingPostImageUrl(entry.slide.printingId, {
      imageFileId: entry.slide.imageFileId,
      label,
      aspect,
      date: postDate,
      scale: 2,
    }),
    filename: printingPostImageFilename(entry.printing.cardSlug, label, aspect, position + 1),
  }));

  async function runDownload(items: readonly DownloadItem[]) {
    setDownloading(true);
    try {
      await downloadSequentially(items);
      setDownloading(false);
    } catch {
      // Not a mutation, so it never reaches the global mutation error handler.
      // Flag reset here and above, not in `finally`: React Compiler can't lower it.
      setDownloading(false);
      toast.error("Couldn't prepare the images. Please try again.");
    }
  }

  const firstByPrinting = new Map<string, SlideEntry>();
  for (const entry of entries) {
    if (!firstByPrinting.has(entry.printing.printingId)) {
      firstByPrinting.set(entry.printing.printingId, entry);
    }
  }
  const caption = buildPrintingsPostCaption(
    [...firstByPrinting.values()].map((entry) => ({
      cardName: entry.printing.cardName,
      publicCode: entry.printing.publicCode,
      finishLabel: enumLabel(labels.finishes, entry.printing.finish),
      channelLabel: channelLabelFor(entry.printing),
      markerLabels: entry.printing.markerSlugs.map((slug) => markerLabelBySlug.get(slug) ?? slug),
      artist: entry.printing.artist,
      imageCredit: showCredit ? (entry.image?.credit ?? null) : null,
      cardUrl: printingDeskCardUrl(entry.printing, getSiteUrl()),
      labelText: POST_IMAGE_LABEL_TEXT[label],
      dateText: postDate === undefined ? undefined : formatPostDate(postDate),
    })),
  );

  if (current === undefined) {
    return <NoSlides />;
  }

  const previewUrl = printingPostImageUrl(current.slide.printingId, {
    imageFileId: current.slide.imageFileId,
    label,
    aspect,
    date: postDate,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Slides</CardTitle>
          <CardDescription>
            {entries.length === 1
              ? "One image. Add more to turn the post into a carousel."
              : "The order here is the order of the carousel."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap gap-3">
            {entries.map((entry, position) => (
              <li key={`${entry.slide.printingId}:${entry.slide.imageFileId}`} className="w-32">
                <Pressable
                  aria-label={`Show slide ${position + 1}, ${entry.printing.cardName}`}
                  aria-pressed={position === index}
                  onClick={() => setSelected(position)}
                  className={cn(
                    "block w-full rounded-md",
                    position === index && "ring-primary ring-2",
                  )}
                >
                  <CardArtThumb
                    src={deskImageSrc(entry.image?.url ?? entry.printing.activeImageUrl, "240w")}
                    landscape={landscapeFor(entry.printing)}
                    rarity={entry.printing.rarity}
                    alt={entry.printing.cardName}
                    loading="lazy"
                    className="w-full"
                  />
                </Pressable>
                <p className="mt-1 truncate text-sm font-medium">{entry.printing.cardName}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {formatPrintingCode(entry.printing.publicCode)}
                </p>
                <div className="mt-1 flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move slide ${position + 1} left`}
                    disabled={position === 0}
                    onClick={() => move(position, position - 1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move slide ${position + 1} right`}
                    disabled={position === entries.length - 1}
                    onClick={() => move(position, position + 1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove slide ${position + 1}`}
                    onClick={() => drop(position)}
                  >
                    <XIcon />
                  </Button>
                </div>
              </li>
            ))}
            <li className="w-32">
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="aspect-card text-muted-foreground h-auto w-full flex-col gap-1 rounded-md border border-dashed"
                    />
                  }
                >
                  <PlusIcon className="size-5" />
                  Add image
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-1">
                  {candidates.length === 0 ? (
                    <p className="text-muted-foreground p-2 text-sm">
                      Every image of these printings is already in the post.
                    </p>
                  ) : (
                    <ul>
                      {candidates.map((candidate) => (
                        <li key={candidate.image.imageFileId}>
                          <Pressable
                            className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md p-1.5"
                            onClick={() =>
                              add({
                                printingId: candidate.printing.printingId,
                                imageFileId: candidate.image.imageFileId,
                              })
                            }
                          >
                            <CardArtThumb
                              src={deskImageSrc(candidate.image.url, "120w")}
                              landscape={landscapeFor(candidate.printing)}
                              alt={candidate.printing.cardName}
                              loading="lazy"
                              className="h-12"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {candidate.printing.cardName}
                              </span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {[FACE_TEXT[candidate.image.face], candidate.image.credit]
                                  .filter(
                                    (part) =>
                                      part !== null && part !== undefined && part.length > 0,
                                  )
                                  .join(" · ")}
                              </span>
                            </span>
                          </Pressable>
                        </li>
                      ))}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardContent className="space-y-2">
            <img
              src={previewUrl}
              alt={`Slide ${index + 1} for ${current.printing.cardName}`}
              width={POST_IMAGE_PREVIEW_WIDTH}
              height={(POST_IMAGE_PREVIEW_WIDTH * h) / w}
              className="bg-muted mx-auto h-auto w-full max-w-[540px] rounded-lg"
            />
            <p className="text-muted-foreground text-center text-xs">
              {postImagePreviewCaption(aspect)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Make the post</CardTitle>
            <CardDescription>Pick the wording and the shape.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel>Label</FieldLabel>
              <DeskSegmented
                ariaLabel="Label"
                value={label}
                onChange={(next) => goTo({ label: next })}
                options={LABEL_OPTIONS}
              />
            </Field>

            <Field>
              <FieldLabel>Date</FieldLabel>
              <DatePicker
                value={postDayValue}
                onChange={(iso) => goTo({ date: iso })}
                onClear={() => goTo({ date: POST_DATE_NONE })}
                placeholder={postDate === undefined ? "No date" : formatPostDate(postDate)}
              />
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={() => goTo({ date: todayUtc() })}>
                  Today
                </Button>
                {announcedDate === null ? null : (
                  <Button variant="ghost" size="sm" onClick={() => goTo({ date: announcedDate })}>
                    Announced on
                  </Button>
                )}
                {releaseDate === undefined ? null : (
                  <Button variant="ghost" size="sm" onClick={() => goTo({ date: releaseDate })}>
                    Release period
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => goTo({ date: POST_DATE_NONE })}>
                  Clear
                </Button>
              </div>
              <FieldDescription>
                {postDate === undefined
                  ? "No date on the image"
                  : `Shown as “${formatPostDate(postDate)}”`}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Format</FieldLabel>
              <DeskSegmented
                ariaLabel="Format"
                value={aspect}
                onChange={(next) => goTo({ aspect: next })}
                options={ASPECT_OPTIONS}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Checkbox
                id="desk-post-credit"
                checked={showCredit}
                onCheckedChange={(checked) => setShowCredit(checked === true)}
              />
              <FieldLabel htmlFor="desk-post-credit">Image credit</FieldLabel>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void runDownload(downloadItems.slice(index, index + 1))}
                disabled={downloading}
              >
                <DownloadIcon />
                Download this slide
              </Button>
              <Button
                variant="outline"
                onClick={() => void runDownload(downloadItems)}
                disabled={downloading}
              >
                <DownloadIcon />
                Download all
              </Button>
              <Button variant="outline" onClick={() => void copy(caption)}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                Copy caption
              </Button>
            </div>

            <Field>
              <FieldLabel htmlFor="desk-post-caption">Caption</FieldLabel>
              <Textarea id="desk-post-caption" readOnly rows={9} value={caption} />
              <FieldDescription>
                Built from the catalog. Each link opens the card page with that printing selected.
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
