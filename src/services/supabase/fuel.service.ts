import { FUEL_ENTRY_STATUSES, mapFuelEntryDbRow, type FuelEntry, type FuelEntryStatus } from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { type ServiceResult, ok, fail, SUPABASE_MISSING_ERROR } from "./service-types";

const selectFields =
  "id, employee_id, vehicle_id, faction, fuel_type, coupon_date, quantity_liters, distance_km, odometer_current, odometer_new, image_path, signature_name, notes, status, reviewed_by, reviewed_at, created_at, updated_at";

const isStoragePath = (value: string | null | undefined): value is string =>
  Boolean(value) && !/^https?:\/\//i.test(value as string) && !(value as string).startsWith("data:");

export class FuelService {
  static async listForCurrentUser(limit = 100): Promise<ServiceResult<FuelEntry[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("fuel_entries")
        .select(selectFields)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapFuelEntryDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load fuel entries.");
    }
  }

  static async countPendingForAdmin(): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { count, error } = await supabase
        .from("fuel_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", FUEL_ENTRY_STATUSES.PENDING);

      if (error) {
        return fail(error.message);
      }

      return ok(count ?? 0);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to count pending fuel entries.");
    }
  }

  static async createEntry(params: {
    employeeId: string;
    faction: string;
    vehicleId: string;
    fuelType: string;
    couponDate: string;
    quantityLiters: number;
    distanceKm: number;
    odometerCurrent: number;
    imagePath?: string | null;
    signatureName?: string | null;
    notes?: string | null;
    actorAuthUserId: string;
  }): Promise<ServiceResult<FuelEntry>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = fixPossiblyMojibake(params.faction.trim());
    const normalizedFuelType = fixPossiblyMojibake(params.fuelType.trim());
    const normalizedSignatureName = params.signatureName ? fixPossiblyMojibake(params.signatureName.trim()) : null;
    const normalizedNotes = params.notes ? fixPossiblyMojibake(params.notes) : null;
    const odometerNew = params.odometerCurrent + params.distanceKm;

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("fuel_entries")
        .insert({
          employee_id: params.employeeId,
          vehicle_id: params.vehicleId,
          faction: normalizedFaction,
          fuel_type: normalizedFuelType,
          coupon_date: params.couponDate,
          quantity_liters: params.quantityLiters,
          distance_km: params.distanceKm,
          odometer_current: params.odometerCurrent,
          odometer_new: odometerNew,
          image_path: params.imagePath ?? null,
          signature_name: normalizedSignatureName,
          notes: normalizedNotes,
          status: FUEL_ENTRY_STATUSES.PENDING,
        })
        .select(selectFields)
        .single();

      if (error) {
        return fail(error.message);
      }

      const { error: odometerError } = await supabase
        .from("vehicles")
        .update({ last_odometer: odometerNew })
        .eq("id", params.vehicleId)
        .lt("last_odometer", odometerNew);

      if (odometerError) {
        return fail(`Fuel entry created but failed to update vehicle odometer: ${odometerError.message}`);
      }

      const entry = mapFuelEntryDbRow(data);

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.employeeId,
        action: "fuel.submit",
        entityType: "fuel_entry",
        entityId: entry.id,
        details: {
          liters: entry.quantityLiters,
          vehicleId: entry.vehicleId,
          faction: entry.faction,
        },
      });

      return ok(entry);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to submit fuel entry.");
    }
  }

  static async reviewEntry(params: {
    entryId: string;
    status: FuelEntryStatus;
    reviewerAuthUserId: string;
    reviewerEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("fuel_entries")
        .update({
          status: params.status,
          reviewed_by: params.reviewerAuthUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", params.entryId)
        .select("id, employee_id, faction, status")
        .maybeSingle();

      if (error) {
        return fail(error.message);
      }

      if (!data) {
        return fail("Fuel entry not found.");
      }

      const { data: employeeRow, error: employeeError } = await supabase
        .from("employees")
        .select("auth_user_id")
        .eq("id", data.employee_id)
        .maybeSingle();

      if (employeeError) {
        return fail(employeeError.message);
      }

      const targetAuthUserId = employeeRow?.auth_user_id ?? null;
      if (targetAuthUserId && targetAuthUserId !== params.reviewerAuthUserId) {
        const isApproved = params.status === FUEL_ENTRY_STATUSES.REVIEWED;
        const title = isApproved ? "موافقة على استمارة الوقود" : "رفض استمارة الوقود";
        const message = isApproved
          ? "تمت الموافقة على استمارة الوقود الخاصة بك."
          : "تم رفض استمارة الوقود الخاصة بك، يرجى مراجعة الإدارة.";

        const { error: notifyError } = await supabase.from("notifications").insert({
          sender_auth_user_id: params.reviewerAuthUserId,
          target_auth_user_id: targetAuthUserId,
          title,
          message,
          type: "fuel_review",
          target_type: "user",
          target_faction: data.faction ?? null,
          is_read: false,
        });

        if (notifyError) {
          return fail(notifyError.message);
        }
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.reviewerAuthUserId,
        actorEmployeeId: params.reviewerEmployeeId ?? null,
        action: "fuel.review",
        entityType: "fuel_entry",
        entityId: params.entryId,
        details: { status: params.status },
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to review fuel entry.");
    }
  }

  static async deleteEntryForAdmin(params: {
    entryId: string;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data: row, error: rowError } = await supabase
        .from("fuel_entries")
        .select("id, image_path, employee_id, faction")
        .eq("id", params.entryId)
        .maybeSingle();

      if (rowError) {
        return fail(rowError.message);
      }

      if (!row) {
        return fail("Fuel entry not found.");
      }

      const { error: deleteError } = await supabase.from("fuel_entries").delete().eq("id", params.entryId);
      if (deleteError) {
        return fail(deleteError.message);
      }

      if (isStoragePath(row.image_path)) {
        await supabase.storage.from("fuel-bon").remove([row.image_path]);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "fuel.delete",
        entityType: "fuel_entry",
        entityId: params.entryId,
        details: {
          employeeId: row.employee_id,
          faction: row.faction,
        },
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to delete fuel entry.");
    }
  }

  static async clearEntriesForAdmin(params: {
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
    scope?: "all" | "reviewed";
  }): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      let query = supabase.from("fuel_entries").select("id, image_path, status");

      if (params.scope === "reviewed") {
        query = query.in("status", [FUEL_ENTRY_STATUSES.REVIEWED, FUEL_ENTRY_STATUSES.REJECTED]);
      }

      const { data: rows, error: rowsError } = await query;
      if (rowsError) {
        return fail(rowsError.message);
      }

      const targets = rows ?? [];
      if (!targets.length) {
        return ok(0);
      }

      const ids = targets.map((item: { id: string }) => item.id);
      const imagePaths = targets
        .map((item: { image_path?: string | null }) => item.image_path ?? null)
        .filter((value: string | null): value is string => isStoragePath(value));

      const { error: deleteError } = await supabase.from("fuel_entries").delete().in("id", ids);
      if (deleteError) {
        return fail(deleteError.message);
      }

      if (imagePaths.length) {
        const uniquePaths = Array.from(new Set(imagePaths));
        await supabase.storage.from("fuel-bon").remove(uniquePaths);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "fuel.clear",
        entityType: "fuel_entry",
        entityId: null,
        details: {
          deletedCount: ids.length,
          scope: params.scope ?? "all",
        },
      });

      return ok(ids.length);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to clear fuel entries.");
    }
  }
}
