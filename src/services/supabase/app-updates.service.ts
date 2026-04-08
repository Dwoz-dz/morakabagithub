import {
  EMPLOYEE_ROLES,
  mapAppUpdateDbRow,
  type EmployeeRole,
  type AppUpdate,
  type AppUpdateDbRow,
  type UpdateResolution,
  type UpdateTargetRole,
} from "@/src/models";
import { compareVersions, isVersionLowerThan } from "@/src/utils/versioning";

import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { deleteStorageObjectsFromBucket } from "./storage.service";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

interface UpdateEvaluationInput {
  currentVersion: string;
  role: EmployeeRole;
}

interface UpsertUpdateInput {
  id?: string;
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
  publishedAt?: string | null;
  actorAuthUserId: string;
}

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const APP_UPDATES_SELECT =
  "id, version, minimum_required_version, title, release_notes, is_mandatory, target_roles, apk_path, android_url, ios_url, is_active, force_logout_after_update, published_at, created_by, created_at, updated_at";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const normalizeReleaseNotes = (releaseNotes: string[]): string[] =>
  releaseNotes.map((item) => item.trim()).filter(Boolean);

const normalizeTargetRoles = (targetRoles: UpdateTargetRole[]): UpdateTargetRole[] => {
  const normalized = targetRoles
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is UpdateTargetRole => item === "member" || item === "admin" || item === "all");

  if (!normalized.length) {
    return [];
  }

  const unique = Array.from(new Set(normalized));
  if (unique.includes("all")) {
    return ["all"];
  }

  const hasMember = unique.includes(EMPLOYEE_ROLES.MEMBER);
  const hasAdmin = unique.includes(EMPLOYEE_ROLES.ADMIN);

  if (hasMember && hasAdmin) {
    return ["all"];
  }

  if (hasAdmin) {
    return [EMPLOYEE_ROLES.ADMIN];
  }

  return [EMPLOYEE_ROLES.MEMBER];
};

const normalizeRole = (role: EmployeeRole | string): EmployeeRole => {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  return normalized === EMPLOYEE_ROLES.ADMIN ? EMPLOYEE_ROLES.ADMIN : EMPLOYEE_ROLES.MEMBER;
};

const appliesToRole = (role: EmployeeRole, update: AppUpdate): boolean => {
  const normalizedRole = normalizeRole(role);
  const targetRoles = normalizeTargetRoles(update.targetRoles);
  if (!targetRoles.length) {
    return false;
  }

  return targetRoles.includes("all") || targetRoles.includes(normalizedRole);
};

const getRoleFilter = (role: EmployeeRole): UpdateTargetRole[] =>
  normalizeRole(role) === EMPLOYEE_ROLES.ADMIN ? [EMPLOYEE_ROLES.ADMIN, "all"] : [EMPLOYEE_ROLES.MEMBER, "all"];

const toReadableError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export class AppUpdatesService {
  static async listAdminUpdates(limit = 30): Promise<ServiceResult<AppUpdate[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("app_updates")
        .select(APP_UPDATES_SELECT)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map((row: AppUpdateDbRow) => mapAppUpdateDbRow(row)));
    } catch (error) {
      return fail(toReadableError(error, "Failed to load updates."));
    }
  }

  static async upsertUpdate(input: UpsertUpdateInput): Promise<ServiceResult<AppUpdate>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const nowIso = new Date().toISOString();
      const targetRoles = normalizeTargetRoles(input.targetRoles);
      if (!targetRoles.length) {
        return fail("Update target roles are required (member/admin/all).");
      }

      const shouldPublish = Boolean(input.isActive);
      const publishedAt = shouldPublish ? input.publishedAt ?? nowIso : input.publishedAt ?? null;
      const apkPath = input.apkPath?.trim() || null;

      if (shouldPublish && !apkPath) {
        return fail("Active updates require an APK file uploaded to Supabase Storage.");
      }

      let existingUpdate: AppUpdate | null = null;
      if (input.id) {
        const { data, error } = await supabase
          .from("app_updates")
          .select(APP_UPDATES_SELECT)
          .eq("id", input.id)
          .maybeSingle();

        if (error) {
          return fail(error.message);
        }

        existingUpdate = data ? mapAppUpdateDbRow(data as AppUpdateDbRow) : null;
      }

      const payload = {
        version: input.version.trim(),
        minimum_required_version: input.minimumRequiredVersion.trim(),
        title: input.title.trim(),
        release_notes: normalizeReleaseNotes(input.releaseNotes),
        is_mandatory: Boolean(input.isMandatory),
        target_roles: targetRoles,
        apk_path: apkPath,
        android_url: input.androidUrl?.trim() || null,
        ios_url: input.iosUrl?.trim() || null,
        is_active: shouldPublish,
        force_logout_after_update: Boolean(input.forceLogoutAfterUpdate),
        published_at: publishedAt,
        updated_at: nowIso,
      };

      let previousApkPaths: string[] = [];
      if (shouldPublish) {
        const { data, error } = await supabase
          .from("app_updates")
          .select("id, apk_path")
          .not("apk_path", "is", null);

        if (error) {
          return fail(error.message);
        }

        const previousRows = (data ?? []) as { apk_path: string | null }[];
        previousApkPaths = previousRows
          .map((row) => row.apk_path)
          .filter((path): path is string => Boolean(path));
      }

      if (shouldPublish) {
        let deactivateQuery = supabase
          .from("app_updates")
          .update({
            is_active: false,
            updated_at: nowIso,
          })
          .eq("is_active", true)
          .overlaps("target_roles", targetRoles);

        if (input.id) {
          deactivateQuery = deactivateQuery.neq("id", input.id);
        }

        const { error: deactivateError } = await deactivateQuery;
        if (deactivateError) {
          return fail(deactivateError.message);
        }
      }

      let savedUpdate: AppUpdate;
      if (input.id) {
        const { data, error } = await supabase
          .from("app_updates")
          .update(payload)
          .eq("id", input.id)
          .select(APP_UPDATES_SELECT)
          .single();

        if (error) {
          return fail(error.message);
        }

        savedUpdate = mapAppUpdateDbRow(data as AppUpdateDbRow);
      } else {
        const { data, error } = await supabase
          .from("app_updates")
          .insert({
            ...payload,
            created_by: input.actorAuthUserId,
          })
          .select(APP_UPDATES_SELECT)
          .single();

        if (error) {
          return fail(error.message);
        }

        savedUpdate = mapAppUpdateDbRow(data as AppUpdateDbRow);
      }

      const stalePaths = new Set<string>();
      if (existingUpdate?.apkPath && existingUpdate.apkPath !== savedUpdate.apkPath) {
        stalePaths.add(existingUpdate.apkPath);
      }

      if (shouldPublish) {
        previousApkPaths
          .filter((path) => path !== savedUpdate.apkPath)
          .forEach((path) => stalePaths.add(path));
      }

      if (stalePaths.size > 0) {
        void deleteStorageObjectsFromBucket({
          bucket: "app-updates-apk",
          paths: [...stalePaths],
        });
      }

      return ok(savedUpdate);
    } catch (error) {
      return fail(toReadableError(error, "Failed to save update."));
    }
  }

  static async evaluateForCurrentUser(input: UpdateEvaluationInput): Promise<ServiceResult<UpdateResolution>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const role = normalizeRole(input.role);
      if (role === EMPLOYEE_ROLES.ADMIN) {
        return ok({
          requirement: "none",
          activeUpdate: null,
          history: [],
          shouldForceLogout: false,
        });
      }

      const supabase = getSupabaseClient() as any;
      const roleFilter = getRoleFilter(role);

      const [activeResult, historyResult] = await Promise.all([
        supabase
          .from("app_updates")
          .select(APP_UPDATES_SELECT)
          .eq("is_active", true)
          .overlaps("target_roles", roleFilter)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("app_updates")
          .select(APP_UPDATES_SELECT)
          .overlaps("target_roles", roleFilter)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (activeResult.error) {
        return fail(activeResult.error.message);
      }

      if (historyResult.error) {
        return fail(historyResult.error.message);
      }

      const activeRows: AppUpdate[] = (activeResult.data ?? []).map((row: AppUpdateDbRow) =>
        mapAppUpdateDbRow(row),
      );
      const historyRows: AppUpdate[] = (historyResult.data ?? []).map((row: AppUpdateDbRow) =>
        mapAppUpdateDbRow(row),
      );

      const activeUpdate = activeRows.find((item) => appliesToRole(role, item)) ?? null;
      const history = historyRows.filter((item) => appliesToRole(role, item));

      if (!activeUpdate) {
        return ok({
          requirement: "none",
          activeUpdate: null,
          history,
          shouldForceLogout: false,
        });
      }

      const isHardMandatory =
        isVersionLowerThan(input.currentVersion, activeUpdate.minimumRequiredVersion) ||
        (activeUpdate.isMandatory && isVersionLowerThan(input.currentVersion, activeUpdate.version));

      const isOptional =
        !isHardMandatory && isVersionLowerThan(input.currentVersion, activeUpdate.version);

      const shouldForceLogout =
        Boolean(activeUpdate.forceLogoutAfterUpdate) &&
        compareVersions(input.currentVersion, activeUpdate.version) >= 0;

      return ok({
        requirement: isHardMandatory ? "mandatory" : isOptional ? "optional" : "none",
        activeUpdate,
        history,
        shouldForceLogout,
      });
    } catch (error) {
      return fail(toReadableError(error, "Failed to evaluate update state."));
    }
  }
}
