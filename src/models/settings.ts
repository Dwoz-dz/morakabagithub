import { normalizeTextDeep } from "@/src/utils/text-normalization";

export interface AppSetting {
  key: string;
  value: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string;
}

export interface AppSettingDbRow {
  key: string;
  value: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

export type ReminderType = "oil_change" | "weapon_inspection" | "monthly_fuel_bon";

export interface ReminderLeadDays {
  oilChange: number;
  weaponInspection: number;
  monthlyFuelBon: number;
}

export interface ReminderConfig {
  oilChangeDate: string | null;
  weaponInspectionDate: string | null;
  monthlyFuelBonDay: number | null;
  leadDays: ReminderLeadDays;
}

export interface ReminderCountdown {
  type: ReminderType;
  title: string;
  dueDate: string | null;
  daysRemaining: number | null;
  isOverdue: boolean;
  leadDays: number;
}

export interface SmartUpdateConfig {
  latestVersion: string;
  minimumRequiredVersion: string;
  title: string;
  releaseNotes: string;
  isMandatory: boolean;
  targetRoles: string[];
  androidUrl: string;
  iosUrl: string;
  isActive: boolean;
  publishedAt: string | null;
}

export const mapAppSettingDbRow = (row: AppSettingDbRow): AppSetting => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    key: normalizedRow.key,
    value: normalizedRow.value ?? {},
    updatedBy: normalizedRow.updated_by ?? null,
    updatedAt: normalizedRow.updated_at,
  };
};

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  oilChangeDate: null,
  weaponInspectionDate: null,
  monthlyFuelBonDay: null,
  leadDays: {
    oilChange: 3,
    weaponInspection: 2,
    monthlyFuelBon: 5,
  },
};

export const DEFAULT_SMART_UPDATE_CONFIG: SmartUpdateConfig = {
  latestVersion: "",
  minimumRequiredVersion: "",
  title: "",
  releaseNotes: "",
  isMandatory: false,
  targetRoles: ["member", "admin"],
  androidUrl: "",
  iosUrl: "",
  isActive: false,
  publishedAt: null,
};
