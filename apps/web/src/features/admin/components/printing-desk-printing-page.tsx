import type { DeskImage, DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { enumLabel } from "@openrift/shared/enum-label";
import { formatDay } from "@openrift/shared/format-date";
import { formatPrintingCode } from "@openrift/shared/printing-code";
import type { AdminPrintingCitation } from "@openrift/shared/types/api/admin";
import { getOrientation } from "@openrift/shared/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  LinkIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Share2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { Suspense, useRef, useState } from "react";

import { PageTopBarBack, PageTopBarButton } from "@/components/layout/page-top-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BrandGlyph } from "@/components/ui/brand-glyph";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dropzone } from "@/components/ui/dropzone";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { PrintingDeskEditFields } from "@/features/admin/components/printing-desk-form-page";
import { DeskSegmented, DeskStatusBadge } from "@/features/admin/components/printing-desk-shared";
import {
  useActivatePrintingImage,
  useDeletePrintingImage,
  useRotatePrintingImage,
  useUploadPrintingImage,
} from "@/features/admin/hooks/use-admin-image-mutations";
import {
  useAdminPrintingCitations,
  useCreatePrintingCitation,
  useDeletePrintingCitation,
  useUpdatePrintingCitation,
} from "@/features/admin/hooks/use-admin-printing-citations";
import {
  useDeskPrinting,
  useSetDeskImageFace,
  useUpdateDeskImage,
} from "@/features/admin/hooks/use-printing-desk";
import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { deskImageSrc } from "@/features/admin/lib/printing-desk-image";
import { deskPrintingPeriod } from "@/features/admin/lib/printing-desk-status";
import { encodePostSlides } from "@/features/admin/lib/printing-post-slides";
import { sourceBrand } from "@/features/admin/lib/source-brand";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { CardDetail } from "@/features/cards/components/card-detail/card-detail";
import { ImageHoverPreview } from "@/features/cards/components/printing-hover-preview";
import { freshCardDetailQueryOptions } from "@/features/cards/hooks/use-card-detail";
import { cardsKeys, catalogKeys, promosKeys } from "@/features/cards/lib/cards-query-keys";
import { buildChannelBreadcrumbsBySlug } from "@/features/cards/lib/channel-breadcrumbs";
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { useMarkers } from "@/hooks/use-markers";
import { useMouseHover } from "@/hooks/use-mouse-hover";
import { useSession } from "@/lib/auth-session";
import { errorText } from "@/lib/error-text";

const DESK_IMAGE_SCOPE = [
  adminKeys.printingDesk.all,
  adminKeys.cards.all,
  catalogKeys.all,
  cardsKeys.all,
  promosKeys.all,
] as const;

type Rotation = 0 | 90 | 180 | 270;
type Face = "front" | "back";

const FACE_OPTIONS = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
] as const satisfies readonly { value: Face; label: string }[];

export function PrintingDeskPrintingPage({ printingId }: { printingId: string }) {
  const { data } = useDeskPrinting(printingId);
  const { data: channelData } = useDistributionChannels();
  const { data: session } = useSession();
  const uploadImage = useUploadPrintingImage(DESK_IMAGE_SCOPE);
  const activateImage = useActivatePrintingImage(DESK_IMAGE_SCOPE);

  const [uploading, setUploading] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const printing = data.printing;
  const channelPaths = buildChannelBreadcrumbsBySlug(channelData.distributionChannels);
  const channelPath = printing.distributionChannelSlugs
    .map((slug) => channelPaths.get(slug) ?? slug)
    .join(", ");
  const uploaderName = session?.user.name ?? "";
  const activeFront = data.images.find((image) => image.face === "front" && image.isActive) ?? null;
  const postImage = activeFront ?? data.images.at(0) ?? null;
  const postSlides =
    postImage === null
      ? null
      : encodePostSlides([{ printingId, imageFileId: postImage.imageFileId }]);

  async function handleFiles(files: File[]) {
    setUploadError(null);
    const credit = uploaderName.length > 0 ? uploaderName : undefined;
    for (const file of files) {
      setUploading((current) => [...current, file.name]);
      try {
        await uploadImage.mutateAsync({ printingId, file, mode: "additional", credit });
      } catch (error) {
        setUploadError(errorText(error, `Could not upload ${file.name}.`));
      }
      setUploading((current) => current.filter((name) => name !== file.name));
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title={printing.cardName}
        back={<PageTopBarBack to="/admin/printing-desk" />}
        actions={
          postSlides === null ? (
            <PageTopBarButton disabled>
              <Share2Icon />
              Make a post
            </PageTopBarButton>
          ) : (
            <PageTopBarButton
              render={<Link to="/admin/printing-desk/post" search={{ slides: postSlides }} />}
            >
              <Share2Icon />
              Make a post
            </PageTopBarButton>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {channelPath.length > 0 && <Badge variant="muted">{channelPath}</Badge>}
        <Badge variant="outline" className="font-mono">
          {formatPrintingCode(printing.publicCode)}
        </Badge>
        <DeskStatusBadge row={printing} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <DetailsCard printing={printing} channelPath={channelPath} />

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dropzone
                multiple
                accept="image/*"
                disabled={uploading.length > 0}
                icon={<UploadIcon className="text-muted-foreground size-5" />}
                label="Drop images here or click to choose"
                hint="JPG, PNG or WebP, up to 50 MB each. Landscape is fine, battlefields get turned for you. Everything lands as a front, switch a row to Back below."
                onFiles={(files) => void handleFiles(files)}
              />

              {uploading.map((name) => (
                <p key={name} className="text-muted-foreground flex items-center gap-2 text-sm">
                  <LoaderIcon className="size-4 animate-spin" />
                  Uploading {name}…
                </p>
              ))}

              {uploadError && (
                <Alert variant="destructive">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}

              {data.images.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No images yet. The card page falls back to the base printing&apos;s art.
                </p>
              ) : (
                <>
                  {FACE_OPTIONS.map((option) => {
                    const images = data.images.filter((image) => image.face === option.value);
                    if (images.length === 0) {
                      return null;
                    }
                    const activeId = images.find((image) => image.isActive)?.printingImageId ?? "";
                    return (
                      <div key={option.value} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{option.label}</p>
                          {activeId !== "" && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() =>
                                activateImage.mutate({ imageId: activeId, active: false })
                              }
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                        <RadioGroup
                          aria-label={`Active ${option.label.toLowerCase()} image`}
                          value={activeId}
                          onValueChange={(value) => {
                            if (typeof value === "string" && value !== "") {
                              activateImage.mutate({ imageId: value, active: true });
                            }
                          }}
                          className="gap-2"
                        >
                          {images.map((image) => (
                            <DeskImageRow
                              key={image.printingImageId}
                              image={image}
                              cardName={printing.cardName}
                              landscape={getOrientation([printing.cardType]) === "landscape"}
                            />
                          ))}
                        </RadioGroup>
                      </div>
                    );
                  })}
                  <p className="text-muted-foreground text-xs">
                    Set one active per side. The front one shows on the card page and on the promos
                    page.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <LinksCard printingId={printingId} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>On the card page</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
              <CardPagePreview cardSlug={printing.cardSlug} printingId={printingId} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CardPagePreview({ cardSlug, printingId }: { cardSlug: string; printingId: string }) {
  const { data } = useSuspenseQuery(freshCardDetailQueryOptions(cardSlug));
  const printing = data.printings.find((entry) => entry.id === printingId);

  if (!printing) {
    return (
      <p className="text-muted-foreground text-sm">
        Not on the card page yet. It appears once the catalog picks the printing up.
      </p>
    );
  }

  return <CardDetail printing={printing} showImages showPrices={false} />;
}

function DetailsCard({
  printing,
  channelPath,
}: {
  printing: DeskPrintingRow;
  channelPath: string;
}) {
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const { data: markerData } = useMarkers();
  const [editing, setEditing] = useState(false);

  const markerLabels = new Map(markerData.markers.map((marker) => [marker.slug, marker.label]));
  const canEdit = printing.canEdit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        {canEdit && !editing && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
            <PrintingDeskEditFields
              printingId={printing.printingId}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </Suspense>
        ) : (
          <>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <DetailRow label="Channel" value={channelPath.length > 0 ? channelPath : "None"} />
              <DetailRow label="Code" value={formatPrintingCode(printing.publicCode)} />
              <DetailRow label="Set" value={printing.setName} />
              <DetailRow label="Finish" value={enumLabel(labels.finishes, printing.finish)} />
              <DetailRow
                label="Language"
                value={languageLabels[printing.language] ?? printing.language}
              />
              <DetailRow label="Size" value={enumLabel(labels.cardSizes, printing.size)} />
              <DetailRow label="Artist" value={printing.artist} />
              {printing.announcedAt !== null && printing.announcedAt !== undefined && (
                <DetailRow label="Announced on" value={formatDay(printing.announcedAt)} />
              )}
              <DetailRow label="Available from" value={deskPrintingPeriod(printing)} />
            </dl>

            {printing.markerSlugs.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {printing.markerSlugs.map((slug) => (
                  <Badge key={slug} variant="subtle">
                    {markerLabels.get(slug) ?? slug}
                  </Badge>
                ))}
              </div>
            )}

            {printing.comment !== null &&
              printing.comment !== undefined &&
              printing.comment.length > 0 && (
                <p className="text-muted-foreground mt-3 text-sm">{printing.comment}</p>
              )}

            {!canEdit && (
              <p className="text-muted-foreground mt-3 text-sm">
                Not a promo. Only the admin changes these details.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  );
}

function DeskImageRow({
  image,
  cardName,
  landscape,
}: {
  image: DeskImage;
  cardName: string;
  landscape: boolean;
}) {
  const rotateImage = useRotatePrintingImage(DESK_IMAGE_SCOPE);
  const deleteImage = useDeletePrintingImage(DESK_IMAGE_SCOPE);
  const updateImage = useUpdateDeskImage();
  const setFace = useSetDeskImageFace();
  const rowRef = useRef<HTMLDivElement>(null);
  const { hovering, hoverProps } = useMouseHover();

  const storedCredit = image.credit ?? "";
  // The row keeps rendering while a save is in flight, so the stored value is
  // copied in when it changes, not only seeded at mount.
  const [credit, setCredit] = useState(storedCredit);
  const [lastCredit, setLastCredit] = useState(storedCredit);
  if (storedCredit !== lastCredit) {
    setLastCredit(storedCredit);
    setCredit(storedCredit);
  }

  const fullUrl = deskImageSrc(image.url, "full");

  function rotate(by: 90 | 270) {
    const next = ((image.rotation + by) % 360) as Rotation;
    rotateImage.mutate({ imageId: image.printingImageId, rotation: next });
  }

  function saveCredit() {
    const next = credit.trim();
    if (next !== storedCredit) {
      updateImage.mutate({
        imageFileId: image.imageFileId,
        credit: next.length > 0 ? next : null,
      });
    }
  }

  return (
    <div ref={rowRef} {...hoverProps} className="rounded-lg border p-2">
      <div className="flex flex-wrap items-center gap-3">
        <CardArtThumb
          src={deskImageSrc(image.url, "240w")}
          landscape={landscape}
          alt={cardName}
          loading="lazy"
          className="h-14"
        />
        {hovering && (
          <ImageHoverPreview
            thumbnailUrl={deskImageSrc(image.url, "400w")}
            fullUrl={fullUrl}
            landscape={landscape}
            anchorRef={rowRef}
          />
        )}

        <div className="space-y-1 text-sm">
          <DeskSegmented
            ariaLabel="Side"
            value={image.face}
            onChange={(next) =>
              setFace.mutate({ printingImageId: image.printingImageId, face: next })
            }
            options={FACE_OPTIONS}
          />
          <p className="text-muted-foreground text-xs">Turned {image.rotation}°</p>
        </div>

        <Input
          aria-label="Image credit"
          className="order-last w-full lg:order-none lg:w-auto lg:min-w-40 lg:flex-1"
          value={credit}
          placeholder="Who made this image"
          onChange={(event) => setCredit(event.target.value)}
          onBlur={saveCredit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              saveCredit();
            }
          }}
        />

        <span className="ml-auto flex items-center gap-0.5 lg:ml-0">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Turn left"
            onClick={() => rotate(270)}
            disabled={rotateImage.isPending}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Turn right"
            onClick={() => rotate(90)}
            disabled={rotateImage.isPending}
          >
            <RotateCwIcon />
          </Button>
          {fullUrl !== null && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Open full size"
              render={
                <a href={fullUrl} target="_blank" rel="noreferrer" aria-label="Open full size" />
              }
            >
              <ExternalLinkIcon />
            </Button>
          )}

          <label
            htmlFor={`active-${image.printingImageId}`}
            className="flex shrink-0 items-center gap-1.5 text-sm"
          >
            <RadioGroupItem id={`active-${image.printingImageId}`} value={image.printingImageId} />
            Active
          </label>

          {image.canDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete image"
              onClick={() => deleteImage.mutate(image.printingImageId)}
              disabled={deleteImage.isPending}
            >
              <Trash2Icon />
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

function LinksCard({ printingId }: { printingId: string }) {
  const { data } = useAdminPrintingCitations(printingId);
  const createCitation = useCreatePrintingCitation();
  const updateCitation = useUpdatePrintingCitation();
  const deleteCitation = useDeletePrintingCitation();
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const citations = data?.citations ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Links</CardTitle>
        <CardDescription>Where the promo was shown or announced.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {citations.map((citation) => (
          <CitationRow
            key={citation.id}
            citation={citation}
            onSave={(sourceUrl) =>
              updateCitation.mutate({ printingId, citationId: citation.id, sourceUrl })
            }
            onDelete={() => deleteCitation.mutate({ printingId, citationId: citation.id })}
          />
        ))}

        <div className="flex flex-wrap items-end gap-2">
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor="desk-link-label">Add link</FieldLabel>
            <Input
              id="desk-link-label"
              value={newLabel}
              placeholder="Launch party unboxing"
              onChange={(event) => setNewLabel(event.target.value)}
            />
          </Field>
          <Input
            aria-label="Link address"
            className="min-w-48 flex-1"
            value={newUrl}
            placeholder="https://…"
            onChange={(event) => setNewUrl(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={newLabel.trim().length === 0 || createCitation.isPending}
            onClick={() => {
              createCitation.mutate({
                printingId,
                label: newLabel.trim(),
                sourceUrl: newUrl.trim().length > 0 ? newUrl.trim() : null,
              });
              setNewLabel("");
              setNewUrl("");
            }}
          >
            <PlusIcon />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CitationRow({
  citation,
  onSave,
  onDelete,
}: {
  citation: AdminPrintingCitation;
  onSave: (sourceUrl: string | null) => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState(citation.sourceUrl ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex min-w-32 flex-1 items-center gap-1.5 truncate text-sm">
        <BrandGlyph icon={sourceBrand(url)} fallback={LinkIcon} className="size-3.5" />
        <span className="truncate">{citation.label}</span>
      </span>
      <Input
        aria-label={`Link for ${citation.label}`}
        className="min-w-48 flex-1"
        value={url}
        placeholder="https://…"
        disabled={!citation.canEdit}
        onChange={(event) => setUrl(event.target.value)}
        onBlur={() => {
          const next = url.trim();
          if (next !== (citation.sourceUrl ?? "")) {
            onSave(next.length > 0 ? next : null);
          }
        }}
      />
      {citation.canEdit && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${citation.label}`}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}
