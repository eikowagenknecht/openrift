import type { Domain, Rarity } from "@openrift/shared";
import { create } from "zustand";

import { clampImageTransform } from "@/lib/card-designer";

/** Everything the card template (`CardPlaceholderImage`) visibly renders. */
export interface DesignerCard {
  name: string;
  domains: Domain[];
  energy: number | null;
  might: number | null;
  power: number | null;
  mightBonus: number | null;
  type: string; // card-type slug, "" when unset
  superTypes: string[];
  tags: string[];
  rulesText: string;
  effectText: string;
  flavorText: string;
  rarity: Rarity | null;
  publicCode: string; // footer "code" line
  artist: string; // raw text; openrift.app is appended at render time
}

/** The chosen background image, held client-side only as a data URL. */
export interface BackgroundImage {
  dataUrl: string | null;
  aspect: number | null; // natural width / height, for cover + pan math
  scale: number; // >= 1, cover baseline
  offsetX: number; // fraction of card width, clamped so the image always covers
  offsetY: number; // fraction of card height
}

interface CardDesignerState {
  card: DesignerCard;
  background: BackgroundImage;
  /** Whether `openrift.app` is appended to the artist line. */
  showAttribution: boolean;

  setCardField: <K extends keyof DesignerCard>(key: K, value: DesignerCard[K]) => void;
  setImage: (dataUrl: string, aspect: number | null) => void;
  clearImage: () => void;
  setImageTransform: (
    patch: Partial<Pick<BackgroundImage, "scale" | "offsetX" | "offsetY">>,
  ) => void;
  setShowAttribution: (value: boolean) => void;
  reset: () => void;
}

const emptyCard: DesignerCard = {
  name: "",
  domains: [],
  energy: null,
  might: null,
  power: null,
  mightBonus: null,
  type: "",
  superTypes: [],
  tags: [],
  rulesText: "",
  effectText: "",
  flavorText: "",
  rarity: null,
  publicCode: "",
  artist: "",
};

// A complete, obviously-made-up card so the designer looks alive the moment you
// open it (and shows off the layout). Edit or clear it to make your own.
const funExampleCard: DesignerCard = {
  name: "Sir Pounce, Lord of Naps",
  domains: ["chaos", "calm"],
  energy: 2,
  might: 5,
  power: 1,
  mightBonus: 1,
  type: "unit",
  superTypes: ["champion"],
  tags: ["Cat", "Floof"],
  rulesText: "When Sir Pounce enters, knock one card off the table. (Yes, on purpose.)",
  effectText: "Untargetable by anything boring.",
  flavorText: '"I meant to do that."',
  rarity: "epic",
  publicCode: "MEOW-009/009",
  artist: "Whiskers von Catsworth",
};

const defaultBackground: BackgroundImage = {
  dataUrl: null,
  aspect: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export const useCardDesignerStore = create<CardDesignerState>()((set) => ({
  card: { ...funExampleCard },
  background: { ...defaultBackground },
  showAttribution: true,

  setCardField: (key, value) => {
    set((state) => ({ card: { ...state.card, [key]: value } }));
  },

  setImage: (dataUrl, aspect) => {
    set({ background: { dataUrl, aspect, scale: 1, offsetX: 0, offsetY: 0 } });
  },

  clearImage: () => {
    set({ background: { ...defaultBackground } });
  },

  setImageTransform: (patch) => {
    set((state) => {
      const next = clampImageTransform(
        {
          scale: patch.scale ?? state.background.scale,
          offsetX: patch.offsetX ?? state.background.offsetX,
          offsetY: patch.offsetY ?? state.background.offsetY,
        },
        state.background.aspect,
      );
      return { background: { ...state.background, ...next } };
    });
  },

  setShowAttribution: (value) => {
    set({ showAttribution: value });
  },

  reset: () => {
    set({ card: { ...emptyCard }, background: { ...defaultBackground }, showAttribution: true });
  },
}));
