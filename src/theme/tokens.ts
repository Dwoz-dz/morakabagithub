import { Platform } from "react-native";

export const palette = {
  background: "#F4F7FB",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF3FA",
  primary: "#0E4D92",
  primaryDark: "#0A3768",
  accent: "#1D8F6A",
  text: "#0F1C2E",
  textMuted: "#53617A",
  line: "#D7E0EE",
  warning: "#E29D2A",
  danger: "#CC3D3D",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  md: 12,
  lg: 16,
  xl: 24,
};

export const typography = {
  title: 30,
  subtitle: 14,
  body: 15,
  caption: 12,
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#0A1C34",
      shadowOpacity: 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 4,
    },
    default: {},
  }),
};

