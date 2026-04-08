import { normalizeTextDeep } from "@/src/utils/text-normalization";

export interface LinkedDevice {
  id: string;
  authUserId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string;
  createdAt: string;
}

export interface LinkedDeviceDbRow {
  id: string;
  auth_user_id: string;
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string | null;
  last_seen_at: string;
  created_at: string;
}

export const mapLinkedDeviceDbRow = (row: LinkedDeviceDbRow): LinkedDevice => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    authUserId: normalizedRow.auth_user_id,
    deviceId: normalizedRow.device_id,
    deviceName: normalizedRow.device_name,
    platform: normalizedRow.platform,
    appVersion: normalizedRow.app_version ?? null,
    lastSeenAt: normalizedRow.last_seen_at,
    createdAt: normalizedRow.created_at,
  };
};
