/**
 * Morakaba Spacing System
 * Mobile-first with comfortable thumb zone
 */

export const spacing = {
  0: 0,
  1: 4, // Minimal gap
  2: 8, // Compact spacing
  3: 12, // Comfortable
  4: 16, // Standard
  5: 20, // Generous
  6: 24, // Section padding
  7: 28,
  8: 32, // Large section
  9: 36,
  10: 40, // Screen padding
  12: 48,
  14: 56,
  16: 64,
};

/**
 * Mobile-specific sizes
 * Optimized for touch targets and thumb zones
 */
export const sizes = {
  // Minimum touch target (Apple/Material Design)
  touchMin: 48,
  touchOptimal: 56,
  touchLarge: 64,

  // Safe area padding (mobile)
  screenHorizontalPadding: spacing[5], // 20px
  screenVerticalPadding: spacing[6], // 24px

  // Component specific
  bottomNavHeight: 80, // With safe area (56px nav + padding)
  statusBarHeight: 44, // iOS

  // Content widths
  maxContentWidth: 480,
  maxCardWidth: 400,
};

/**
 * Border radius (Clean, professional)
 */
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

/**
 * Z-index scale (Modal stack)
 */
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  backdrop: 1040,
  modal: 1050,
  tooltip: 1070,
};

export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type ZIndex = typeof zIndex;
