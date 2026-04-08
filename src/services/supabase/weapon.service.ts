import {
  mapWeaponSubmissionDbRow,
  WEAPON_SUBMISSION_STATUSES,
  type WeaponSubmission,
  type WeaponSubmissionStatus,
} from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });
const isStoragePath = (value: string | null | undefined): value is string =>
  Boolean(value) && !/^https?:\/\//i.test(value as string) && !(value as string).startsWith("data:");

const selectFields =
  "id, employee_id, faction, weapon_type, serial_number, check_date, image_path, signature_path, signature_name, notes, status, reviewed_by, reviewed_at, created_at, updated_at";
const selectFieldsWithoutSignaturePath =
  "id, employee_id, faction, weapon_type, serial_number, check_date, image_path, signature_name, notes, status, reviewed_by, reviewed_at, created_at, updated_at";

const SIGNATURE_PATH_MARKER_PREFIX = "[[signature_path:";
const SIGNATURE_PATH_MARKER_REGEX = /\[\[signature_path:([^[\]]+)\]\]/;

const isMissingSignaturePathColumn = (message: string): boolean =>
  message.includes("weapon_submissions.signature_path") && message.includes("does not exist");

const appendLegacySignaturePath = (notes: string | null | undefined, signaturePath: string): string => {
  const cleanNotes = notes?.trim() ?? "";
  const marker = `${SIGNATURE_PATH_MARKER_PREFIX}${signaturePath}]]`;
  return cleanNotes ? `${cleanNotes}\n${marker}` : marker;
};

const extractLegacySignaturePath = (notes: string | null | undefined): { notes: string | null; signaturePath: string | null } => {
  if (!notes) {
    return { notes: null, signaturePath: null };
  }

  const matched = notes.match(SIGNATURE_PATH_MARKER_REGEX);
  if (!matched?.[1]) {
    return { notes, signaturePath: null };
  }

  const cleaned = notes.replace(matched[0], "").trim();
  return {
    notes: cleaned || null,
    signaturePath: matched[1].trim() || null,
  };
};

const normalizeLegacySubmission = (submission: WeaponSubmission): WeaponSubmission => {
  if (submission.signaturePath) {
    return submission;
  }

  const extracted = extractLegacySignaturePath(submission.notes);
  if (!extracted.signaturePath) {
    return submission;
  }

  return {
    ...submission,
    signaturePath: extracted.signaturePath,
    notes: extracted.notes,
  };
};

export class WeaponService {
  static async listForCurrentUser(limit = 100): Promise<ServiceResult<WeaponSubmission[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("weapon_submissions")
        .select(selectFields)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error && isMissingSignaturePathColumn(error.message)) {
        const fallbackResult = await supabase
          .from("weapon_submissions")
          .select(selectFieldsWithoutSignaturePath)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (fallbackResult.error) {
          return fail(fallbackResult.error.message);
        }

        const normalized = (fallbackResult.data ?? []).map((row: any) =>
          normalizeLegacySubmission(
            mapWeaponSubmissionDbRow({
              ...row,
              signature_path: null,
            }),
          ),
        );

        return ok(normalized);
      }

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapWeaponSubmissionDbRow).map(normalizeLegacySubmission));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load weapon submissions.");
    }
  }

  static async countPendingForAdmin(): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { count, error } = await supabase
        .from("weapon_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", WEAPON_SUBMISSION_STATUSES.PENDING);

      if (error) {
        return fail(error.message);
      }

      return ok(count ?? 0);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to count pending weapon submissions.");
    }
  }

  static async createSubmission(params: {
    employeeId: string;
    faction: string;
    weaponType: string;
    serialNumber?: string | null;
    checkDate: string;
    imagePath?: string | null;
    signaturePath?: string | null;
    signatureName?: string | null;
    notes?: string | null;
    actorAuthUserId: string;
  }): Promise<ServiceResult<WeaponSubmission>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = fixPossiblyMojibake(params.faction.trim());
    const normalizedWeaponType = fixPossiblyMojibake(params.weaponType.trim());
    const normalizedSerialNumber = params.serialNumber ? fixPossiblyMojibake(params.serialNumber.trim()) || null : null;
    const normalizedSignatureName = params.signatureName ? fixPossiblyMojibake(params.signatureName.trim()) || null : null;
    const normalizedNotes = params.notes ? fixPossiblyMojibake(params.notes) : null;

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("weapon_submissions")
        .insert({
          employee_id: params.employeeId,
          faction: normalizedFaction,
          weapon_type: normalizedWeaponType,
          serial_number: normalizedSerialNumber,
          check_date: params.checkDate,
          image_path: params.imagePath ?? null,
          signature_path: params.signaturePath ?? null,
          signature_name: normalizedSignatureName,
          notes: normalizedNotes,
          status: WEAPON_SUBMISSION_STATUSES.PENDING,
        })
        .select(selectFields)
        .single();

      if (error && isMissingSignaturePathColumn(error.message)) {
        const fallbackInsert = await supabase
          .from("weapon_submissions")
          .insert({
            employee_id: params.employeeId,
            faction: normalizedFaction,
            weapon_type: normalizedWeaponType,
            serial_number: normalizedSerialNumber,
            check_date: params.checkDate,
            image_path: params.imagePath ?? null,
            signature_name: normalizedSignatureName,
            notes: params.signaturePath
              ? appendLegacySignaturePath(normalizedNotes ?? null, params.signaturePath)
              : normalizedNotes ?? null,
            status: WEAPON_SUBMISSION_STATUSES.PENDING,
          })
          .select(selectFieldsWithoutSignaturePath)
          .single();

        if (fallbackInsert.error) {
          return fail(fallbackInsert.error.message);
        }

        const submission = normalizeLegacySubmission(
          mapWeaponSubmissionDbRow({
            ...fallbackInsert.data,
            signature_path: null,
          }),
        );

        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.employeeId,
          action: "weapon.submit",
          entityType: "weapon_submission",
          entityId: submission.id,
          details: {
            weaponType: submission.weaponType,
            faction: submission.faction,
          },
        });

        return ok(submission);
      }

      if (error) {
        return fail(error.message);
      }

      const submission = normalizeLegacySubmission(mapWeaponSubmissionDbRow(data));

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.employeeId,
        action: "weapon.submit",
        entityType: "weapon_submission",
        entityId: submission.id,
        details: {
          weaponType: submission.weaponType,
          faction: submission.faction,
        },
      });

      return ok(submission);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to submit weapon check.");
    }
  }

  static async reviewSubmission(params: {
    submissionId: string;
    status: WeaponSubmissionStatus;
    reviewerAuthUserId: string;
    reviewerEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase
        .from("weapon_submissions")
        .update({
          status: params.status,
          reviewed_by: params.reviewerAuthUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", params.submissionId);

      if (error) {
        return fail(error.message);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.reviewerAuthUserId,
        actorEmployeeId: params.reviewerEmployeeId ?? null,
        action: "weapon.review",
        entityType: "weapon_submission",
        entityId: params.submissionId,
        details: { status: params.status },
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to review weapon submission.");
    }
  }

  static async deleteSubmissionForAdmin(params: {
    submissionId: string;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data: row, error: rowError } = await supabase
        .from("weapon_submissions")
        .select("id, image_path, signature_path, employee_id, faction, status")
        .eq("id", params.submissionId)
        .maybeSingle();

      if (rowError) {
        return fail(rowError.message);
      }

      if (!row) {
        return fail("Weapon submission not found.");
      }

      const { error: deleteError } = await supabase
        .from("weapon_submissions")
        .delete()
        .eq("id", params.submissionId);

      if (deleteError) {
        return fail(deleteError.message);
      }

      const storageTargets = [row.image_path ?? null, row.signature_path ?? null].filter(
        (value: string | null): value is string => isStoragePath(value),
      );
      if (storageTargets.length) {
        await supabase.storage.from("weapon-checks").remove(Array.from(new Set(storageTargets)));
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "weapon.delete",
        entityType: "weapon_submission",
        entityId: params.submissionId,
        details: {
          employeeId: row.employee_id,
          faction: row.faction,
          status: row.status,
        },
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to delete weapon submission.");
    }
  }

  static async clearSubmissionsForAdmin(params: {
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
    scope?: "all" | "reviewed";
  }): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      let query = supabase
        .from("weapon_submissions")
        .select("id, image_path, signature_path, status");

      if (params.scope === "reviewed") {
        query = query.in("status", [
          WEAPON_SUBMISSION_STATUSES.REVIEWED,
          WEAPON_SUBMISSION_STATUSES.REJECTED,
        ]);
      }

      const { data: rows, error: rowsError } = await query;
      if (rowsError) {
        return fail(rowsError.message);
      }

      const targets = rows ?? [];
      if (!targets.length) {
        return ok(0);
      }

      const ids = targets.map((row: { id: string }) => row.id);
      const storageTargets = targets
        .flatMap((row: { image_path?: string | null; signature_path?: string | null }) => [
          row.image_path ?? null,
          row.signature_path ?? null,
        ])
        .filter((value: string | null): value is string => isStoragePath(value));

      const { error: deleteError } = await supabase.from("weapon_submissions").delete().in("id", ids);
      if (deleteError) {
        return fail(deleteError.message);
      }

      if (storageTargets.length) {
        await supabase.storage.from("weapon-checks").remove(Array.from(new Set(storageTargets)));
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "weapon.clear",
        entityType: "weapon_submission",
        entityId: null,
        details: {
          deletedCount: ids.length,
          scope: params.scope ?? "all",
        },
      });

      return ok(ids.length);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to clear weapon submissions.");
    }
  }
}
