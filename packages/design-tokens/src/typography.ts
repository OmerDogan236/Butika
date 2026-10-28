export const fontFamilies = {
  display: 'Fraunces',
  displayItalic: 'Fraunces_400Italic',
  body: 'Inter',
} as const;

export const fontSizes = {
  display: 56,
  h1: 40,
  h2: 28,
  h3: 20,
  body: 16,
  caption: 14,
  micro: 12,
} as const;

export const lineHeights = {
  display: 1.05,
  heading: 1.15,
  body: 1.5,
  tight: 1.25,
} as const;

export const letterSpacing = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1.5,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type FontSizeToken = keyof typeof fontSizes;
