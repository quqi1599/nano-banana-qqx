import type { AppSettings } from '../types';

export type ModelResolution = AppSettings['resolution'];
export type ModelAspectRatio = AppSettings['aspectRatio'];
type SupportedAspectRatio = Exclude<ModelAspectRatio, 'Auto'>;

export interface ImageModelProfile {
  name: string;
  label: string;
  imageSizes: readonly ModelResolution[];
  aspectRatios: readonly SupportedAspectRatio[];
  summary: string;
}

interface ImageModelOption {
  name: string;
  label: string;
  recommended?: boolean;
}

const COMMON_ASPECT_RATIOS: readonly SupportedAspectRatio[] = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
];

const BANANA_2_EXTRA_ASPECT_RATIOS: readonly SupportedAspectRatio[] = [
  '1:4',
  '1:8',
  '4:1',
  '8:1',
];

const BANANA_PRO_PROFILE: ImageModelProfile = {
  name: 'gemini-3-pro-image-preview',
  label: 'Banana Pro (3.0模型)',
  imageSizes: ['1K', '2K', '4K'],
  aspectRatios: COMMON_ASPECT_RATIOS,
  summary: '最高支持 4K，适合高质量出图。',
};

const BANANA_2_PROFILE: ImageModelProfile = {
  name: 'gemini-3.1-flash-image-preview',
  label: 'Banana 2（3.1模型）',
  imageSizes: ['512', '1K', '2K', '4K'],
  aspectRatios: [...COMMON_ASPECT_RATIOS, ...BANANA_2_EXTRA_ASPECT_RATIOS],
  summary: '支持 512/1K/2K/4K 和更宽比例，适合快速创作与高并发场景。',
};

const BANANA_25_PROFILE: ImageModelProfile = {
  name: 'gemini-2.5-flash-image',
  label: 'Banana（2.5模型）',
  imageSizes: ['1K', '2K'],
  aspectRatios: COMMON_ASPECT_RATIOS,
  summary: '经典 2.5 版本，速度稳定，适合日常快速生成。',
};

const IMAGE_MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image',
};

export const IMAGE_MODEL_OPTIONS: readonly ImageModelOption[] = [
  { name: BANANA_2_PROFILE.name, label: BANANA_2_PROFILE.label, recommended: true },
  { name: BANANA_PRO_PROFILE.name, label: BANANA_PRO_PROFILE.label },
  { name: BANANA_25_PROFILE.name, label: BANANA_25_PROFILE.label },
] as const;

const PROFILE_BY_NAME: Record<string, ImageModelProfile> = {
  [BANANA_PRO_PROFILE.name]: BANANA_PRO_PROFILE,
  [BANANA_2_PROFILE.name]: BANANA_2_PROFILE,
  [BANANA_25_PROFILE.name]: BANANA_25_PROFILE,
  'gemini-2.5-flash-image-preview': BANANA_25_PROFILE,
};

export const IMAGE_MODEL_LABEL_MAP: Record<string, string> = {
  [BANANA_PRO_PROFILE.name]: BANANA_PRO_PROFILE.label,
  [BANANA_2_PROFILE.name]: BANANA_2_PROFILE.label,
  [BANANA_25_PROFILE.name]: BANANA_25_PROFILE.label,
  'gemini-2.5-flash-image-preview': 'Banana（2.5模型，兼容ID）',
};

export const DEFAULT_MODEL_NAME = BANANA_2_PROFILE.name;
export const DEFAULT_RESOLUTION: ModelResolution = '1K';
export const DEFAULT_ASPECT_RATIO: ModelAspectRatio = 'Auto';
const DEFAULT_ASPECT_RATIO_OPTIONS: readonly ModelAspectRatio[] = ['Auto', ...COMMON_ASPECT_RATIOS];

export const normalizeImageModelName = (modelName?: string): string => {
  const raw = modelName?.trim();
  if (!raw) return DEFAULT_MODEL_NAME;
  return IMAGE_MODEL_ALIASES[raw] || raw;
};

export const getImageModelProfile = (modelName?: string): ImageModelProfile | null => {
  const normalized = normalizeImageModelName(modelName);
  return PROFILE_BY_NAME[normalized] || null;
};

export const getImageModelLabel = (modelName?: string): string => {
  const profile = getImageModelProfile(modelName);
  if (profile) return profile.label;
  return normalizeImageModelName(modelName);
};

export const getImageSizeOptionsForModel = (modelName?: string): readonly ModelResolution[] | null => {
  const profile = getImageModelProfile(modelName);
  return profile ? profile.imageSizes : null;
};

export const getAspectRatioOptionsForModel = (modelName?: string): readonly ModelAspectRatio[] => {
  const profile = getImageModelProfile(modelName);
  if (!profile) return DEFAULT_ASPECT_RATIO_OPTIONS;
  return ['Auto', ...profile.aspectRatios];
};

export const isHighResolution = (resolution: ModelResolution): boolean => resolution === '2K' || resolution === '4K';

export const sanitizeImageConfigForModel = ({
  modelName,
  resolution,
  aspectRatio,
}: {
  modelName?: string;
  resolution: ModelResolution;
  aspectRatio: ModelAspectRatio;
}): {
  normalizedModelName: string;
  imageConfig: Record<string, string>;
  effectiveResolution: ModelResolution;
  effectiveAspectRatio: ModelAspectRatio;
  hasKnownProfile: boolean;
} => {
  const normalizedModelName = normalizeImageModelName(modelName);
  const profile = getImageModelProfile(normalizedModelName);
  const imageConfig: Record<string, string> = {};

  let effectiveResolution: ModelResolution = resolution;
  let effectiveAspectRatio: ModelAspectRatio = aspectRatio;

  if (profile) {
    const sizeSupported = profile.imageSizes.includes(resolution);
    effectiveResolution = sizeSupported ? resolution : profile.imageSizes[0];
    imageConfig.imageSize = effectiveResolution;

    if (aspectRatio !== 'Auto') {
      const ratioSupported = profile.aspectRatios.includes(aspectRatio as SupportedAspectRatio);
      if (ratioSupported) {
        imageConfig.aspectRatio = aspectRatio;
      } else {
        effectiveAspectRatio = 'Auto';
      }
    }
  } else if (aspectRatio !== 'Auto') {
    imageConfig.aspectRatio = aspectRatio;
  }

  return {
    normalizedModelName,
    imageConfig,
    effectiveResolution,
    effectiveAspectRatio,
    hasKnownProfile: Boolean(profile),
  };
};
