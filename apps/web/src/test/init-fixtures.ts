import type { InitResponse } from "@openrift/shared/types/api/init";

export function stubInitResponse(enums: Partial<InitResponse["enums"]> = {}): InitResponse {
  return {
    enums: {
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      cardSizes: [],
      deckFormats: [],
      deckZones: [],
      conditions: [],
      graders: [],
      languages: [],
      markers: [],
      ...enums,
    },
    keywords: {},
    distributionChannels: [],
    customTags: [],
    championIdentifierTags: [],
    tagCategories: [],
    tagCategoryMap: {},
  };
}

export const MISSING_IMAGE_ENUMS: Partial<InitResponse["enums"]> = {
  finishes: [{ slug: "foil", label: "Foil", sortOrder: 0 }],
  languages: [{ slug: "DE", label: "German", sortOrder: 0, color: null }],
};
