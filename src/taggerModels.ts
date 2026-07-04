import type { TaggerModel } from './store'

export const TAGGER_MODELS: Record<
  TaggerModel,
  { name: string; tab: string; description: string; defaultThreshold: number }
> = {
  wd: {
    name: 'WD SwinV2 Tagger v3',
    tab: 'WD (anime)',
    defaultThreshold: 0.35,
    description:
      'Anime-focused vision model by SmilingWolf. Generates booru-style tags with configurable confidence thresholds.',
  },
  joytag: {
    name: 'JoyTag',
    tab: 'JoyTag (general)',
    defaultThreshold: 0.4,
    description:
      'Booru-schema tagger that also handles photographic content and is strong on NSFW concepts. The explicitness rating is derived from its tags.',
  },
}
