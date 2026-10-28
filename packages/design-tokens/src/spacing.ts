export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 9999,
} as const;

export const border = {
  hairline: 1,
  thin: 1,
  thick: 2,
} as const;

export const screenPadding = {
  mobile: 24,
  admin: 48,
} as const;

export type SpaceToken = (typeof space)[number];
export type RadiusToken = keyof typeof radius;
