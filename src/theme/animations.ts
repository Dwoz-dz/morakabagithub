/**
 * Morakaba Animation System
 * Smooth, professional, iOS-like feel
 */

/**
 * Spring animations configuration
 * iOS default feel with slight overshoot
 */
export const springConfig = {
  // Smooth, responsive spring
  smooth: {
    damping: 10,
    mass: 1,
    stiffness: 100,
    overshootClamping: false,
  },

  // Quick, snappy spring
  snappy: {
    damping: 12,
    mass: 1,
    stiffness: 150,
    overshootClamping: false,
  },

  // Gentle, slow spring
  gentle: {
    damping: 8,
    mass: 1.5,
    stiffness: 60,
    overshootClamping: false,
  },

  // Very bouncy (playful)
  bouncy: {
    damping: 6,
    mass: 1,
    stiffness: 120,
    overshootClamping: false,
  },
};

/**
 * Timing configurations
 */
export const timing = {
  // Quick interactions
  quick: 150,

  // Standard animations
  standard: 300,

  // Slower, more deliberate
  slow: 500,

  // Very slow (page transitions)
  verySlow: 800,
};

/**
 * Easing functions
 */
export const easing = {
  // Material Design easing (fast out, slow in)
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",

  // Accelerating (fast out)
  out: "cubic-bezier(0, 0, 0.2, 1)",

  // Decelerating (slow in)
  in: "cubic-bezier(0.4, 0, 1, 1)",

  // Linear (for continuous rotations)
  linear: "linear",

  // Bouncy out
  bounceOut: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
};

/**
 * Common animation presets
 */
export const animations = {
  // Screen transitions
  slideInRight: {
    from: { translateX: 300 },
    to: { translateX: 0 },
  },

  slideOutRight: {
    from: { translateX: 0 },
    to: { translateX: 300 },
  },

  slideInLeft: {
    from: { translateX: -300 },
    to: { translateX: 0 },
  },

  slideOutLeft: {
    from: { translateX: 0 },
    to: { translateX: -300 },
  },

  slideInUp: {
    from: { translateY: 300 },
    to: { translateY: 0 },
  },

  slideOutDown: {
    from: { translateY: 0 },
    to: { translateY: 300 },
  },

  // Fade animations
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },

  fadeOut: {
    from: { opacity: 1 },
    to: { opacity: 0 },
  },

  // Scale animations
  scaleIn: {
    from: { scale: 0.95, opacity: 0 },
    to: { scale: 1, opacity: 1 },
  },

  scaleOut: {
    from: { scale: 1, opacity: 1 },
    to: { scale: 0.95, opacity: 0 },
  },

  // Touch feedback
  pressScale: {
    from: { scale: 1 },
    to: { scale: 0.95 },
  },

  // Loading pulse
  pulse: {
    from: { opacity: 1 },
    to: { opacity: 0.5 },
  },
};

export type SpringConfig = typeof springConfig;
export type Timing = typeof timing;
export type Easing = typeof easing;
export type Animations = typeof animations;
