export const motion = {
  spring: {
    soft: { stiffness: 80, damping: 20 },
    default: { stiffness: 120, damping: 18 },
    snappy: { stiffness: 200, damping: 22 },
  },
  duration: {
    fast: 150,
    base: 250,
    slow: 400,
    cinematic: 600,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0.0, 0.0, 1.0)',
    enter: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
    exit: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  },
} as const;
