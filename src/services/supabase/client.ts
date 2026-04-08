import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type {
  ActivityLogDbRow,
  AnnouncementDbRow,
  AnnouncementReadDbRow,
  AppUpdateDbRow,
  AppSettingDbRow,
  FactionMessageDbRow,
  FactionMessageReadDbRow,
  FuelEntryDbRow,
  LinkedDeviceDbRow,
  EmployeeDbRow,
  NotificationDbRow,
  PresenceDbRow,
  SupportTicketDbRow,
  RegistrationRequestDbRow,
  VehicleDbRow,
  WeaponSubmissionDbRow,
  WeeklyRestAssignmentDbRow,
  WeeklyRestHistoryDbRow,
} from "@/src/models";

interface FactionRow {
  id: string;
  name: string;
}

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: EmployeeDbRow;
        Insert: Partial<EmployeeDbRow>;
        Update: Partial<EmployeeDbRow>;
        Relationships: [];
      };
      registration_requests: {
        Row: RegistrationRequestDbRow;
        Insert: Partial<RegistrationRequestDbRow>;
        Update: Partial<RegistrationRequestDbRow>;
        Relationships: [];
      };
      factions: {
        Row: FactionRow;
        Insert: Partial<FactionRow>;
        Update: Partial<FactionRow>;
        Relationships: [];
      };
      weekly_rest_assignments: {
        Row: WeeklyRestAssignmentDbRow;
        Insert: Partial<WeeklyRestAssignmentDbRow>;
        Update: Partial<WeeklyRestAssignmentDbRow>;
        Relationships: [];
      };
      weekly_rest_history: {
        Row: WeeklyRestHistoryDbRow;
        Insert: Partial<WeeklyRestHistoryDbRow>;
        Update: Partial<WeeklyRestHistoryDbRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationDbRow;
        Insert: Partial<NotificationDbRow>;
        Update: Partial<NotificationDbRow>;
        Relationships: [];
      };
      vehicles: {
        Row: VehicleDbRow;
        Insert: Partial<VehicleDbRow>;
        Update: Partial<VehicleDbRow>;
        Relationships: [];
      };
      fuel_entries: {
        Row: FuelEntryDbRow;
        Insert: Partial<FuelEntryDbRow>;
        Update: Partial<FuelEntryDbRow>;
        Relationships: [];
      };
      weapon_submissions: {
        Row: WeaponSubmissionDbRow;
        Insert: Partial<WeaponSubmissionDbRow>;
        Update: Partial<WeaponSubmissionDbRow>;
        Relationships: [];
      };
      activity_logs: {
        Row: ActivityLogDbRow;
        Insert: Partial<ActivityLogDbRow>;
        Update: Partial<ActivityLogDbRow>;
        Relationships: [];
      };
      support_tickets: {
        Row: SupportTicketDbRow;
        Insert: Partial<SupportTicketDbRow>;
        Update: Partial<SupportTicketDbRow>;
        Relationships: [];
      };
      linked_devices: {
        Row: LinkedDeviceDbRow;
        Insert: Partial<LinkedDeviceDbRow>;
        Update: Partial<LinkedDeviceDbRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingDbRow;
        Insert: Partial<AppSettingDbRow>;
        Update: Partial<AppSettingDbRow>;
        Relationships: [];
      };
      app_updates: {
        Row: AppUpdateDbRow;
        Insert: Partial<AppUpdateDbRow>;
        Update: Partial<AppUpdateDbRow>;
        Relationships: [];
      };
      announcements: {
        Row: AnnouncementDbRow;
        Insert: Partial<AnnouncementDbRow>;
        Update: Partial<AnnouncementDbRow>;
        Relationships: [];
      };
      announcement_reads: {
        Row: AnnouncementReadDbRow;
        Insert: Partial<AnnouncementReadDbRow>;
        Update: Partial<AnnouncementReadDbRow>;
        Relationships: [];
      };
      presence: {
        Row: PresenceDbRow;
        Insert: Partial<PresenceDbRow>;
        Update: Partial<PresenceDbRow>;
        Relationships: [];
      };
      faction_messages: {
        Row: FactionMessageDbRow;
        Insert: Partial<FactionMessageDbRow>;
        Update: Partial<FactionMessageDbRow>;
        Relationships: [];
      };
      faction_message_reads: {
        Row: FactionMessageReadDbRow;
        Insert: Partial<FactionMessageReadDbRow>;
        Update: Partial<FactionMessageReadDbRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const isWebRuntime = Platform.OS === "web";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const createSupabaseClient = (): SupabaseClient<Database> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      // On React Native, eager startup refresh can emit noisy console errors for stale tokens.
      // We keep on-demand refresh via auth.getSession() and enable eager refresh on web only.
      autoRefreshToken: isWebRuntime,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
};

let supabaseSingleton: SupabaseClient<Database> | null = null;

export const getSupabaseClient = (): SupabaseClient<Database> => {
  if (!supabaseSingleton) {
    supabaseSingleton = createSupabaseClient();
  }

  return supabaseSingleton;
};
