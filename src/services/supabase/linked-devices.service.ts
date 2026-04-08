import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { mapLinkedDeviceDbRow, type LinkedDevice } from "@/src/models";

import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

const DEVICE_KEY = "morakaba-device-id";
const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const getOrCreateDeviceId = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }

  const created = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_KEY, created);
  return created;
};

const currentDeviceName = (): string => {
  const model = Constants.deviceName || "Mobile Device";
  return model.toString();
};

const currentAppVersion = (): string | null => {
  return Constants.expoConfig?.version ?? null;
};

export class LinkedDevicesService {
  static async touchCurrentDevice(authUserId: string): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const deviceId = await getOrCreateDeviceId();
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("linked_devices").upsert(
        {
          auth_user_id: authUserId,
          device_id: deviceId,
          device_name: currentDeviceName(),
          platform: Platform.OS,
          app_version: currentAppVersion(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "auth_user_id,device_id" },
      );

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to register device.");
    }
  }

  static async listMyDevices(limit = 30): Promise<ServiceResult<LinkedDevice[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("linked_devices")
        .select("id, auth_user_id, device_id, device_name, platform, app_version, last_seen_at, created_at")
        .order("last_seen_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapLinkedDeviceDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load linked devices.");
    }
  }

  static async removeDevice(deviceId: string): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("linked_devices").delete().eq("id", deviceId);
      if (error) {
        return fail(error.message);
      }
      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to remove device.");
    }
  }
}
