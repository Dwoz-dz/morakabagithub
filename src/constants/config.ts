/**
 * App Constants
 * Configuration and constants used throughout the app
 */

export const APP_NAME = "Morakaba";
export const APP_TAGLINE_AR = "فرقة البحث و الوقاية";
export const APP_TAGLINE_EN = "Research & Prevention Team";

/**
 * API & Backend
 */
export const API_TIMEOUT = 30000; // 30 seconds
export const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Auth
 */
export const AUTH_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
export const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

/**
 * UI/UX
 */
export const ANIMATION_DURATION = {
  quick: 150,
  standard: 300,
  slow: 500,
};

export const DEFAULT_PAGE_SIZE = 20;
export const SCROLL_THROTTLE = 16; // ~60fps

/**
 * Feature Flags
 */
export const FEATURES = {
  enableDarkMode: true,
  enableOfflineMode: true,
  enablePushNotifications: true,
  enableBiometrics: true,
};

/**
 * Environment
 */
export const isDevelopment = process.env.EXPO_PUBLIC_APP_ENV === "development";
export const isProduction = process.env.EXPO_PUBLIC_APP_ENV === "production";
