import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  deckBuilderIntroDismissed: boolean;
  dismissDeckBuilderIntro: () => void;
  collectionIntroDismissed: boolean;
  dismissCollectionIntro: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      deckBuilderIntroDismissed: false,
      dismissDeckBuilderIntro: () => set({ deckBuilderIntroDismissed: true }),
      collectionIntroDismissed: false,
      dismissCollectionIntro: () => set({ collectionIntroDismissed: true }),
    }),
    {
      name: "openrift-onboarding",
      partialize: (state) => ({
        deckBuilderIntroDismissed: state.deckBuilderIntroDismissed,
        collectionIntroDismissed: state.collectionIntroDismissed,
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
        };
      },
    },
  ),
);
