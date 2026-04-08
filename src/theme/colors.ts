/**
 * Morakaba Color System
 * Professional, Security-focused, Modern Design
 */

export const colors = {
  // Primary: Deep Blue (Professional & Secure)
  primary: {
    50: "#F0F4FF",
    100: "#E0E9FF",
    200: "#C1D3FF",
    300: "#A2BDFF",
    400: "#6B8EFF",
    500: "#3B5BDB", // Main brand color
    600: "#2E46B8",
    700: "#1F2D7F",
    800: "#172361",
    900: "#0F1740",
  },

  // Secondary: Cyan (Modern & Positive Energy)
  secondary: {
    50: "#F0FDFA",
    100: "#CCFBF1",
    200: "#99F6E4",
    300: "#5EEAD4",
    400: "#2DD4BF",
    500: "#06B6D4",
    600: "#0891B2",
    700: "#0E7490",
  },

  // Success: Emerald (Positive Actions)
  success: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBFBDC",
    500: "#10B981",
    600: "#059669",
    700: "#047857",
  },

  // Warning: Amber (Alerts & Caution)
  warning: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    500: "#F59E0B",
    600: "#D97706",
    700: "#B45309",
  },

  // Error: Rose (Errors & Dangers)
  error: {
    50: "#FFF5F5",
    100: "#FED7D7",
    200: "#FED7D7",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
  },

  // Neutral: Grayscale (UI Foundation)
  neutral: {
    0: "#FFFFFF",
    50: "#F9FAFB",
    100: "#F3F4F6",
    150: "#EFEFEF",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
    950: "#030712",
  },

  // Semantic Shadows
  shadow: {
    light: "rgba(0, 0, 0, 0.05)",
    medium: "rgba(0, 0, 0, 0.1)",
    dark: "rgba(0, 0, 0, 0.15)",
    deep: "rgba(0, 0, 0, 0.25)",
  },
};

/**
 * Light Theme (Default)
 */
export const lightTheme = {
  // Backgrounds
  background: colors.neutral[0],
  surfaceBackground: colors.neutral[50],
  cardBackground: colors.neutral[0],
  overlayBackground: "rgba(0, 0, 0, 0.5)",

  // Text
  textPrimary: colors.neutral[900],
  textSecondary: colors.neutral[600],
  textTertiary: colors.neutral[500],
  textInverse: colors.neutral[0],

  // UI Elements
  borderDefault: colors.neutral[200],
  borderHover: colors.neutral[300],
  borderActive: colors.primary[500],

  // Interactive
  buttonPrimary: colors.primary[500],
  buttonSecondary: colors.neutral[100],
  buttonDisabled: colors.neutral[200],

  // Status
  successColor: colors.success[500],
  warningColor: colors.warning[500],
  errorColor: colors.error[500],
  infoColor: colors.primary[500],

  // Shadows
  shadowSmall: `0 1px 2px ${colors.shadow.light}`,
  shadowMedium: `0 4px 6px ${colors.shadow.medium}`,
  shadowLarge: `0 10px 15px ${colors.shadow.dark}`,
  shadowXL: `0 20px 25px ${colors.shadow.deep}`,
};

/**
 * Dark Theme
 */
export const darkTheme = {
  // Backgrounds
  background: colors.neutral[950],
  surfaceBackground: colors.neutral[900],
  cardBackground: colors.neutral[800],
  overlayBackground: "rgba(0, 0, 0, 0.8)",

  // Text
  textPrimary: colors.neutral[50],
  textSecondary: colors.neutral[400],
  textTertiary: colors.neutral[500],
  textInverse: colors.neutral[900],

  // UI Elements
  borderDefault: colors.neutral[700],
  borderHover: colors.neutral[600],
  borderActive: colors.primary[400],

  // Interactive
  buttonPrimary: colors.primary[500],
  buttonSecondary: colors.neutral[700],
  buttonDisabled: colors.neutral[600],

  // Status
  successColor: colors.success[500],
  warningColor: colors.warning[500],
  errorColor: colors.error[500],
  infoColor: colors.primary[400],

  // Shadows
  shadowSmall: `0 1px 2px ${colors.shadow.light}`,
  shadowMedium: `0 4px 6px ${colors.shadow.medium}`,
  shadowLarge: `0 10px 15px ${colors.shadow.dark}`,
  shadowXL: `0 20px 25px ${colors.shadow.deep}`,
};

export type Theme = typeof lightTheme;
