export type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

export const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
export const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

export const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";
