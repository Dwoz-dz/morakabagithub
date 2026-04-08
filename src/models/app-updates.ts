import { normalizeTextDeep } from "@/src/utils/text-normalization";

export type UpdateTargetRole = "member" | "admin" | "all";

export interface AppUpdate {
  id: string;
  version: string;
  minimumRequiredVersion: string;
  title: string;
  releaseNotes: string[];
  isMandatory: boolean;
  targetRoles: UpdateTargetRole[];
  apkPath: string | null;
  androidUrl: string | null;
  iosUrl: string | null;
  isActive: boolean;
  forceLogoutAfterUpdate: boolean;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppUpdateDbRow {
  id: string;
  version: string;
  minimum_required_version: string;
  title: string;
  release_notes: unknown;
  is_mandatory: boolean;
  target_roles: unknown;
  apk_path: string | null;
  android_url: string | null;
  ios_url: string | null;
  is_active: boolean;
  force_logout_after_update: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type UpdateRequirement = "none" | "optional" | "mandatory";

export interface UpdateResolution {
  requirement: UpdateRequirement;
  activeUpdate: AppUpdate | null;
  history: AppUpdate[];
  shouldForceLogout: boolean;
}

const normalizeTargetRoles = (value: unknown): UpdateTargetRole[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const valid = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter((item): item is UpdateTargetRole => item === "member" || item === "admin" || item === "all");

  if (!valid.length) {
    return [];
  }

  const unique = Array.from(new Set(valid));
  if (unique.includes("all")) {
    return ["all"];
  }

  const hasMember = unique.includes("member");
  const hasAdmin = unique.includes("admin");

  if (hasMember && hasAdmin) {
    return ["all"];
  }

  if (hasAdmin) {
    return ["admin"];
  }

  return ["member"];
};

const normalizeReleaseNotes = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

export const mapAppUpdateDbRow = (row: AppUpdateDbRow): AppUpdate => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    version: normalizedRow.version,
    minimumRequiredVersion: normalizedRow.minimum_required_version,
    title: normalizedRow.title,
    releaseNotes: normalizeReleaseNotes(normalizedRow.release_notes),
    isMandatory: Boolean(normalizedRow.is_mandatory),
    targetRoles: normalizeTargetRoles(normalizedRow.target_roles),
    apkPath: normalizedRow.apk_path ?? null,
    androidUrl: normalizedRow.android_url ?? null,
    iosUrl: normalizedRow.ios_url ?? null,
    isActive: Boolean(normalizedRow.is_active),
    forceLogoutAfterUpdate: Boolean(normalizedRow.force_logout_after_update),
    publishedAt: normalizedRow.published_at ?? null,
    createdBy: normalizedRow.created_by ?? null,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};
