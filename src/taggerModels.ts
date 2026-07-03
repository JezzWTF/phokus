import type { TaggerModel } from "./store";

export const TAGGER_MODELS: Record<TaggerModel, { name: string; tab: string; description: string }> = {
  wd: {
    name: "WD SwinV2 Tagger v3",
    tab: "WD (anime)",
    description:
      "Anime-focused vision model by SmilingWolf. Generates booru-style tags with configurable confidence thresholds.",
  },
  joytag: {
    name: "JoyTag",
    tab: "JoyTag (general)",
    description:
      "Booru-schema tagger that also handles photographic content and is strong on NSFW concepts. The explicitness rating is derived from its tags.",
  },
};
