// Editorial tasarım sisteminin React Native tüketimi.
// packages/design-tokens'ten gelen ham token'ları RN'de kullanılabilir
// (StyleSheet uyumlu) hale getirir.
import { colors, fontSizes, lineHeights, motion, radius, space } from '@butika/design-tokens';

export const theme = {
  colors,
  space,
  radius,
  motion,
  font: {
    display: 'Newsreader_400Regular',
    displayRegular: 'Newsreader_400Regular',
    displayMedium: 'Newsreader_500Medium',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
    // Küçük büyük harfli etiketler (Lyst'teki "SALE" gibi daktilo yazısı).
    mono: 'RobotoMono_500Medium',
  },
  type: {
    display: {
      fontFamily: 'Newsreader_400Regular',
      fontSize: fontSizes.display,
      lineHeight: fontSizes.display * lineHeights.display,
    },
    h1: {
      fontFamily: 'Newsreader_400Regular',
      fontSize: fontSizes.h1,
      lineHeight: fontSizes.h1 * lineHeights.heading,
    },
    h2: {
      fontFamily: 'Newsreader_400Regular',
      fontSize: fontSizes.h2,
      lineHeight: fontSizes.h2 * lineHeights.heading,
    },
    h3: {
      fontFamily: 'Newsreader_500Medium',
      fontSize: fontSizes.h3,
      lineHeight: fontSizes.h3 * lineHeights.heading,
    },
    body: {
      fontFamily: 'Inter_400Regular',
      fontSize: fontSizes.body,
      lineHeight: fontSizes.body * lineHeights.body,
    },
    caption: {
      fontFamily: 'Inter_400Regular',
      fontSize: fontSizes.caption,
      lineHeight: fontSizes.caption * lineHeights.body,
    },
    micro: {
      fontFamily: 'RobotoMono_500Medium',
      fontSize: fontSizes.micro,
      lineHeight: fontSizes.micro * lineHeights.tight,
    },
  },
} as const;

export type Theme = typeof theme;
