const raw = process.env.EXPO_PUBLIC_PRIMARY_ADMIN_EMAIL ?? "";
export const PRIMARY_ADMIN_EMAIL = raw.trim().toLowerCase();

export const isPrimaryAdminEmail = (email: string | null | undefined): boolean =>
  typeof email === "string" && email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;

