import { mapAppSettingDbRow, type AppSetting } from "@/src/models";
import { normalizeTextDeep } from "@/src/utils/text-normalization";

import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

export class AppSettingsService {
  static async listSettings(): Promise<ServiceResult<AppSetting[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value, updated_by, updated_at")
        .order("key", { ascending: true });

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapAppSettingDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load app settings.");
    }
  }

  static async upsertSetting(params: {
    key: string;
    value: Record<string, unknown>;
    updatedBy: string;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("app_settings").upsert(
        {
          key: params.key,
          value: normalizeTextDeep(params.value),
          updated_by: params.updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to update setting.");
    }
  }
}
