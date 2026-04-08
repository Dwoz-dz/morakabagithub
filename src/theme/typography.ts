/**
 * Morakaba Typography System
 * Clean, Professional, Optimized for RTL
 */

export const typography = {
  // Heading Styles
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
  },

  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
  },

  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
    letterSpacing: 0,
  },

  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
    letterSpacing: 0,
  },

  // Body Text
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
    letterSpacing: 0.2,
  },

  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500" as const,
    letterSpacing: 0.2,
  },

  bodySemibold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },

  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
    letterSpacing: 0.25,
  },

  bodySmallMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500" as const,
    letterSpacing: 0.25,
  },

  // Caption & Labels
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
    letterSpacing: 0.4,
  },

  captionMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500" as const,
    letterSpacing: 0.4,
  },

  // Button Text
  button: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
  },

  buttonSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600" as const,
    letterSpacing: 0.25,
  },

  // Overline (Small, uppercase labels)
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
  },
};

/**
 * Font Stack
 * Arabic first (Cairo) for RTL support
 * Fallback to system fonts for performance
 */
export const fontFamily = {
  // Arabic fonts
  arabicPrimary:
    "Cairo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  arabicMono: "Courier New, monospace",

  // English fonts
  engPrimary:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, sans-serif",
  engMono: "SF Mono, Monaco, Menlo, monospace",

  // Mixed (for mixed content)
  mixed: "Cairo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
};

export type Typography = typeof typography;
