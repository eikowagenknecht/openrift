import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GroupNudgeKind = "contacts" | "lists";

export function groupNudgeKey(slug: string, kind: GroupNudgeKind): string {
  return `${slug}:${kind}`;
}

interface OnboardingState {
  deckBuilderIntroDismissed: boolean;
  dismissDeckBuilderIntro: () => void;
  collectionIntroDismissed: boolean;
  dismissCollectionIntro: () => void;
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
          dismissedGroupNudges: Array.isArray(raw?.dismissedGroupNudges)
            ? raw.dismissedGroupNudges.filter((key) => typeof key === "string")
            : current.dismissedGroupNudges,
        };
      },
    },
  ),
);
