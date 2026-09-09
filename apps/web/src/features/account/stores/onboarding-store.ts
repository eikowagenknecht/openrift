import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GroupNudgeKind = "contacts" | "lists";

export function groupNudgeKey(slug: string, kind: GroupNudgeKind): string {
  return `${slug}:${kind}`;
}

const INTRO_KEYS = ["tier-list", "stage", "list"] as const;

type IntroKey = (typeof INTRO_KEYS)[number];

function isIntroKey(value: unknown): value is IntroKey {
  return typeof value === "string" && INTRO_KEYS.includes(value as IntroKey);
}

interface OnboardingState {
  deckBuilderIntroDismissed: boolean;
  dismissDeckBuilderIntro: () => void;
  collectionIntroDismissed: boolean;
  dismissCollectionIntro: () => void;
  missingImagesNudgeDismissed: boolean;
  dismissMissingImagesNudge: () => void;
  dismissedIntros: IntroKey[];
  dismissIntro: (key: IntroKey) => void;
  dismissedGroupNudges: string[];
  dismissGroupNudge: (slug: string, kind: GroupNudgeKind) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      deckBuilderIntroDismissed: false,
      dismissDeckBuilderIntro: () => set({ deckBuilderIntroDismissed: true }),
      collectionIntroDismissed: false,
      dismissCollectionIntro: () => set({ collectionIntroDismissed: true }),
      missingImagesNudgeDismissed: false,
      dismissMissingImagesNudge: () => set({ missingImagesNudgeDismissed: true }),
      dismissedIntros: [],
      dismissIntro: (key) =>
        set((state) =>
          state.dismissedIntros.includes(key)
            ? state
            : { dismissedIntros: [...state.dismissedIntros, key] },
        ),
      dismissedGroupNudges: [],
      dismissGroupNudge: (slug, kind) =>
        set((state) => {
          const key = groupNudgeKey(slug, kind);
          if (state.dismissedGroupNudges.includes(key)) {
            return state;
          }
          return { dismissedGroupNudges: [...state.dismissedGroupNudges, key] };
        }),
    }),
    {
      name: "openrift-onboarding",
      partialize: (state) => ({
        deckBuilderIntroDismissed: state.deckBuilderIntroDismissed,
        collectionIntroDismissed: state.collectionIntroDismissed,
        missingImagesNudgeDismissed: state.missingImagesNudgeDismissed,
        dismissedIntros: state.dismissedIntros,
        dismissedGroupNudges: state.dismissedGroupNudges,
      }),
      merge: (persisted, current) => {
        const raw = persisted as Partial<OnboardingState> | undefined;
        return {
          ...current,
          deckBuilderIntroDismissed:
            typeof raw?.deckBuilderIntroDismissed === "boolean"
              ? raw.deckBuilderIntroDismissed
              : current.deckBuilderIntroDismissed,
          collectionIntroDismissed:
            typeof raw?.collectionIntroDismissed === "boolean"
              ? raw.collectionIntroDismissed
              : current.collectionIntroDismissed,
          missingImagesNudgeDismissed:
            typeof raw?.missingImagesNudgeDismissed === "boolean"
              ? raw.missingImagesNudgeDismissed
              : current.missingImagesNudgeDismissed,
          dismissedIntros: Array.isArray(raw?.dismissedIntros)
            ? raw.dismissedIntros.filter(isIntroKey)
            : current.dismissedIntros,
          dismissedGroupNudges: Array.isArray(raw?.dismissedGroupNudges)
            ? raw.dismissedGroupNudges.filter((key) => typeof key === "string")
            : current.dismissedGroupNudges,
        };
      },
    },
  ),
);
