export type { CardCandidate, GrayImage, Matrix3, Point, Quad, RgbaImage } from "./types";
export { CARD_ASPECT } from "./types";

export { boxBlurGray, downscaleGray, focusScore, rotateRgbaCw, toGray } from "./image";

export type { ArtWindow } from "./art-window";
export { ART_LANDSCAPE, ART_PORTRAIT, artWindowRect } from "./art-window";

export type {
  AcceptOptions,
  AcceptState,
  ArtTrack,
  FrameDecision,
  FrameWinner,
  VerifiedCandidate,
} from "./accept";
export { observeWinner, pickFrameWinner } from "./accept";

export type { CardEmbedder, EmbedBank, EmbedKind, RankedEmbed } from "./embed";
export {
  EMBED_DIM,
  EMBED_IMAGE_SIZE,
  embedCardRotations,
  normalizeEmbeddings,
  preprocessCardInto,
  rankEmbedBank,
} from "./embed";

export type {
  PrintingPick,
  PrintingResolution,
  PrintingScore,
  PrintingSignature,
  TextBand,
  TournamentOutcome,
} from "./disambiguate";
export {
  bestShiftCorrelation,
  codeStripSignature,
  correlateSignatures,
  discriminativeMargin,
  printingSignature,
  resolvePrinting,
  runPrintingTournament,
  textBandForType,
  textRegionSignature,
} from "./disambiguate";

export type { OrbCvLike, OrbFeatures, OrbVerdict } from "./orb";
export { describeOrb, releaseOrb, verifyOrb } from "./orb";

export type { FrameOutcome, ScanSession, ScanSessionDeps, ScanSessionOptions } from "./session";
export {
  DEFAULT_SESSION_OPTIONS,
  SESSION_UNWARP_HEIGHT,
  SESSION_UNWARP_WIDTH,
  createScanSession,
  mergeCandidates,
} from "./session";

export {
  applyHomography,
  canonicalizeQuad,
  computeHomography,
  quadIou,
  refineQuad,
} from "./geometry";

export type { CvDetectOptions, OpenCvLike } from "./detect-cv";
export { DEFAULT_CV_DETECT_OPTIONS, detectCardsWithCv } from "./detect-cv";

export type { FitOptions } from "./fit-rect";
export { DEFAULT_FIT_OPTIONS, fitCardRects } from "./fit-rect";

export { unwarpCard } from "./unwarp";

export { EMBED_BANK_VERSION, decodeEmbedBank, encodeEmbedBank } from "./embed-format";
