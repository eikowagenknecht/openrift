import { POST_IMAGE_ASPECTS, POST_IMAGE_LABEL_TEXT } from "@openrift/shared/printing-post-image";
import type { PostImageAspect, PostImageLabel } from "@openrift/shared/printing-post-image";

import type { Io } from "../../../io.js";
import {
  blurredArtBackdropDataUri,
  CARD_ASPECT,
  COLORS,
  elideTitle,
  element,
  renderTreeToPng,
  tileArtDataUri,
} from "../../system/services/share-image-core.js";
import type { Element } from "../../system/services/share-image-core.js";

export interface PrintingPostImageInput {
  cardName: string;
  /** Already display-formatted by the caller (`formatPrintingCode`). */
  publicCode: string;
  finishLabel: string;
  channelLabel: string | null;
  markerLabels: string[];
  artist: string;
  siteHost?: string;
  imageCredit: string | null;
  label: PostImageLabel;
  /** Already display-formatted by the caller (`formatPostDate`). */
  dateText?: string;
  imageFileId: string | null;
  orientation: "portrait" | "landscape";
}

interface PostCanvas {
  width: number;
  height: number;
  pad: number;
  ribbonSize: number;
  markerSize: number;
  nameSize: number;
  metaSize: number;
  creditSize: number;
  nameMaxChars: number;
  metaMaxChars: number;
}

const CANVASES: Record<PostImageAspect, PostCanvas> = {
  square: {
    width: POST_IMAGE_ASPECTS.square.w,
    height: POST_IMAGE_ASPECTS.square.h,
    pad: 56,
    ribbonSize: 26,
    markerSize: 24,
    nameSize: 62,
    metaSize: 30,
    creditSize: 24,
    nameMaxChars: 26,
    metaMaxChars: 60,
  },
  portrait: {
    width: POST_IMAGE_ASPECTS.portrait.w,
    height: POST_IMAGE_ASPECTS.portrait.h,
    pad: 60,
    ribbonSize: 28,
    markerSize: 26,
    nameSize: 68,
    metaSize: 32,
    creditSize: 26,
    nameMaxChars: 24,
    metaMaxChars: 56,
  },
  story: {
    width: POST_IMAGE_ASPECTS.story.w,
    height: POST_IMAGE_ASPECTS.story.h,
    pad: 72,
    ribbonSize: 32,
    markerSize: 28,
    nameSize: 78,
    metaSize: 36,
    creditSize: 28,
    nameMaxChars: 22,
    metaMaxChars: 50,
  },
};

const GAP = 28;
const SCRIM = "rgba(12,13,18,0.68)";
const LANDSCAPE_ASPECT = 1 / CARD_ASPECT;
const DOT = " · ";
// resvg panics building the filter region for a wide blur over a large node,
// so these do not scale with the photo.
const SHADOW_OFFSET = 10;
const SHADOW_BLUR = 24;

function ribbon(canvas: PostCanvas, input: PrintingPostImageInput): Element {
  const pill = element(
    "div",
    {
      display: "flex",
      alignItems: "center",
      paddingLeft: Math.round(canvas.ribbonSize * 0.8),
      paddingRight: Math.round(canvas.ribbonSize * 0.8),
      paddingTop: Math.round(canvas.ribbonSize * 0.36),
      paddingBottom: Math.round(canvas.ribbonSize * 0.36),
      borderRadius: Math.round(canvas.ribbonSize * 0.4),
      backgroundColor: COLORS.gold,
      color: COLORS.background,
      fontSize: canvas.ribbonSize,
      fontWeight: 700,
      letterSpacing: Math.round(canvas.ribbonSize * 0.14),
      lineHeight: 1,
    },
    POST_IMAGE_LABEL_TEXT[input.label].toUpperCase(),
  );

  const date =
    input.dateText !== undefined &&
    input.dateText.length > 0 &&
    element(
      "div",
      {
        display: "flex",
        marginLeft: Math.round(canvas.pad * 0.3),
        color: COLORS.gold,
        fontSize: canvas.markerSize,
        fontWeight: 600,
        lineHeight: 1,
      },
      elideTitle(input.dateText, canvas.metaMaxChars),
    );

  const markers =
    input.markerLabels.length > 0 &&
    element(
      "div",
      {
        display: "flex",
        marginLeft: Math.round(canvas.pad * 0.3),
        color: COLORS.text,
        fontSize: canvas.markerSize,
        fontWeight: 600,
        lineHeight: 1,
      },
      elideTitle(input.markerLabels.join(DOT), canvas.metaMaxChars),
    );

  return element("div", { display: "flex", alignItems: "center" }, pill, date, markers);
}

function photoBlock(
  canvas: PostCanvas,
  input: PrintingPostImageInput,
  dataUri: string | null,
  photoW: number,
  photoH: number,
): Element {
  const inner: Element = dataUri
    ? { type: "img", props: { src: dataUri, width: photoW, height: photoH } }
    : element(
        "div",
        {
          display: "flex",
          width: photoW,
          height: photoH,
          alignItems: "center",
          justifyContent: "center",
          padding: Math.round(photoW * 0.08),
          textAlign: "center",
          borderRadius: Math.round(Math.min(photoW, photoH) * 0.05),
          backgroundColor: COLORS.surface,
          border: `2px solid ${COLORS.surfaceBorder}`,
          color: COLORS.muted,
          fontSize: Math.round(photoW * 0.09),
          fontWeight: 600,
          lineHeight: 1.2,
        },
        elideTitle(input.cardName, canvas.nameMaxChars),
      );

  return element(
    "div",
    {
      display: "flex",
      width: photoW,
      height: photoH,
      borderRadius: Math.round(Math.min(photoW, photoH) * 0.05),
      boxShadow: `0 ${SHADOW_OFFSET}px ${SHADOW_BLUR}px rgba(0,0,0,0.6)`,
    },
    inner,
  );
}

function bottomStrip(canvas: PostCanvas, input: PrintingPostImageInput): Element {
  const meta = [input.publicCode, input.finishLabel, input.channelLabel]
    .filter((part): part is string => Boolean(part))
    .join(DOT);

  const credit = [
    input.imageCredit === null ? null : `Image credit: ${input.imageCredit}`,
    `Art: ${input.artist}`,
  ]
    .filter((part): part is string => part !== null)
    .join(DOT);

  return element(
    "div",
    { display: "flex", flexDirection: "column" },
    element(
      "div",
      {
        display: "flex",
        color: COLORS.text,
        fontSize: canvas.nameSize,
        fontWeight: 700,
        lineHeight: 1.1,
      },
      elideTitle(input.cardName, canvas.nameMaxChars),
    ),
    element(
      "div",
      {
        display: "flex",
        marginTop: Math.round(canvas.metaSize * 0.4),
        color: COLORS.gold,
        fontSize: canvas.metaSize,
        fontWeight: 600,
        lineHeight: 1.2,
      },
      elideTitle(meta, canvas.metaMaxChars),
    ),
    element(
      "div",
      {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginTop: Math.round(canvas.creditSize * 0.4),
        color: COLORS.muted,
        fontSize: canvas.creditSize,
        lineHeight: 1.2,
      },
      element("div", { display: "flex" }, elideTitle(credit, canvas.metaMaxChars + 20)),
      input.siteHost
        ? element(
            "div",
            { display: "flex", marginLeft: canvas.creditSize, color: COLORS.gold, fontWeight: 600 },
            input.siteHost,
          )
        : null,
    ),
  );
}

/** Carries no QR and no link on purpose: the host mark is a brand, not something to scan or type. */
export async function renderPrintingPostImage(
  io: Io,
  input: PrintingPostImageInput,
  aspect: PostImageAspect = "square",
  scale = 1,
): Promise<Buffer> {
  const canvas = CANVASES[aspect];
  const { width: canvasW, height: canvasH } = canvas;

  const ribbonH = Math.round(canvas.ribbonSize * 1.72);
  const stripH = Math.round(
    canvas.nameSize * 1.1 + canvas.metaSize * 1.6 + canvas.creditSize * 1.6,
  );
  const availW = canvasW - canvas.pad * 2;
  const availH = canvasH - canvas.pad * 2 - ribbonH - stripH - GAP * 2;

  const photoAspect = input.orientation === "landscape" ? LANDSCAPE_ASPECT : CARD_ASPECT;
  const photoH = Math.floor(Math.min(availH, availW / photoAspect));
  const photoW = Math.floor(photoH * photoAspect);

  const [photoUri, backdropUri] = await Promise.all([
    tileArtDataUri(io, input.imageFileId, photoW, photoH, scale),
    input.imageFileId
      ? blurredArtBackdropDataUri(
          io,
          input.imageFileId,
          Math.round(canvasW / 2),
          Math.round(canvasH / 2),
        )
      : Promise.resolve(null),
  ]);

  const backdrop: Element | false = backdropUri !== null && {
    type: "img",
    props: {
      src: backdropUri,
      width: canvasW,
      height: canvasH,
      style: { position: "absolute", top: 0, left: 0 },
    },
  };

  const scrim = element("div", {
    display: "flex",
    position: "absolute",
    top: 0,
    left: 0,
    width: canvasW,
    height: canvasH,
    backgroundColor: SCRIM,
  });

  const content = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      position: "absolute",
      top: canvas.pad,
      left: canvas.pad,
      width: availW,
      height: canvasH - canvas.pad * 2,
    },
    ribbon(canvas, input),
    element(
      "div",
      {
        display: "flex",
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
      },
      photoBlock(canvas, input, photoUri, photoW, photoH),
    ),
    bottomStrip(canvas, input),
  );

  const root = element(
    "div",
    {
      display: "flex",
      position: "relative",
      width: canvasW,
      height: canvasH,
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    backdrop,
    scrim,
    content,
  );

  return await renderTreeToPng(io, root, canvasW, canvasH, scale);
}
