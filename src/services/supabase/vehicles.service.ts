import { isSupportedFaction } from "@/src/constants/factions";
import { mapVehicleDbRow, type Vehicle } from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";
const VEHICLE_SELECT_FIELDS =
  "id, faction, name, plate_number, vehicle_type, image_path, is_active, last_odometer, maintenance_due_km, created_by, created_at, updated_at";
const VEHICLE_SELECT_FIELDS_LEGACY =
  "id, faction, name, plate_number, vehicle_type, is_active, last_odometer, maintenance_due_km, created_by, created_at, updated_at";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });
const isMissingImagePathColumn = (message: string): boolean =>
  message.includes("vehicles.image_path") && message.includes("does not exist");
const isStoragePath = (value: string | null | undefined): value is string =>
  Boolean(value) && !/^https?:\/\//i.test(value as string) && !(value as string).startsWith("data:");

export class VehiclesService {
  static async listAvailableForCurrentUser(): Promise<ServiceResult<Vehicle[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("vehicles")
        .select(VEHICLE_SELECT_FIELDS)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error && isMissingImagePathColumn(error.message)) {
        const fallback = await supabase
          .from("vehicles")
          .select(VEHICLE_SELECT_FIELDS_LEGACY)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (fallback.error) {
          return fail(fallback.error.message);
        }

        return ok(
          (fallback.data ?? []).map((row: any) =>
            mapVehicleDbRow({
              ...row,
              image_path: null,
            }),
          ),
        );
      }

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapVehicleDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load vehicles.");
    }
  }

  static async listAllForAdmin(): Promise<ServiceResult<Vehicle[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("vehicles")
        .select(VEHICLE_SELECT_FIELDS)
        .order("created_at", { ascending: false });

      if (error && isMissingImagePathColumn(error.message)) {
        const fallback = await supabase
          .from("vehicles")
          .select(VEHICLE_SELECT_FIELDS_LEGACY)
          .order("created_at", { ascending: false });

        if (fallback.error) {
          return fail(fallback.error.message);
        }

        return ok(
          (fallback.data ?? []).map((row: any) =>
            mapVehicleDbRow({
              ...row,
              image_path: null,
            }),
          ),
        );
      }

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapVehicleDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load vehicles.");
    }
  }

  static async createVehicle(params: {
    faction: string;
    name: string;
    plateNumber: string;
    vehicleType: string;
    createdBy: string;
    actorEmployeeId?: string | null;
    maintenanceDueKm?: number | null;
    imagePath?: string | null;
  }): Promise<ServiceResult<Vehicle>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = fixPossiblyMojibake(params.faction.trim());
    if (!isSupportedFaction(normalizedFaction)) {
      return fail("Unsupported faction.");
    }

    const normalizedName = fixPossiblyMojibake(params.name.trim());
    const normalizedPlateNumber = fixPossiblyMojibake(params.plateNumber.trim()).toUpperCase();
    const normalizedVehicleType = fixPossiblyMojibake(params.vehicleType.trim());

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          faction: normalizedFaction,
          name: normalizedName,
          plate_number: normalizedPlateNumber,
          vehicle_type: normalizedVehicleType,
          image_path: params.imagePath ?? null,
          created_by: params.createdBy,
          maintenance_due_km: params.maintenanceDueKm ?? null,
        })
        .select(VEHICLE_SELECT_FIELDS)
        .single();

      if (error && isMissingImagePathColumn(error.message)) {
        const fallbackInsert = await supabase
          .from("vehicles")
          .insert({
            faction: normalizedFaction,
            name: normalizedName,
            plate_number: normalizedPlateNumber,
            vehicle_type: normalizedVehicleType,
            created_by: params.createdBy,
            maintenance_due_km: params.maintenanceDueKm ?? null,
          })
          .select(VEHICLE_SELECT_FIELDS_LEGACY)
          .single();

        if (fallbackInsert.error) {
          return fail(fallbackInsert.error.message);
        }

        const fallbackVehicle = mapVehicleDbRow({
          ...fallbackInsert.data,
          image_path: null,
        });

        await ActivityLogsService.log({
          actorAuthUserId: params.createdBy,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "vehicle.create",
          entityType: "vehicle",
          entityId: fallbackVehicle.id,
          details: {
            plate: fallbackVehicle.plateNumber,
            faction: fallbackVehicle.faction,
            type: fallbackVehicle.vehicleType,
          },
        });

        return ok(fallbackVehicle);
      }

      if (error) {
        return fail(error.message);
      }

      const vehicle = mapVehicleDbRow(data);

      await ActivityLogsService.log({
        actorAuthUserId: params.createdBy,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "vehicle.create",
        entityType: "vehicle",
        entityId: vehicle.id,
        details: {
          plate: vehicle.plateNumber,
          faction: vehicle.faction,
          type: vehicle.vehicleType,
        },
      });

      return ok(vehicle);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to create vehicle.");
    }
  }

  static async setVehicleActive(params: {
    vehicleId: string;
    isActive: boolean;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase
        .from("vehicles")
        .update({ is_active: params.isActive })
        .eq("id", params.vehicleId);

      if (error) {
        return fail(error.message);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "vehicle.toggle_active",
        entityType: "vehicle",
        entityId: params.vehicleId,
        details: { isActive: params.isActive },
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to update vehicle.");
    }
  }

  static async updateVehicleForAdmin(params: {
    vehicleId: string;
    name: string;
    plateNumber: string;
    vehicleType: string;
    maintenanceDueKm?: number | null;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<Vehicle>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedName = fixPossiblyMojibake(params.name.trim());
    const normalizedPlateNumber = fixPossiblyMojibake(params.plateNumber.trim()).toUpperCase();
    const normalizedVehicleType = fixPossiblyMojibake(params.vehicleType.trim());

    if (!normalizedName || !normalizedPlateNumber || !normalizedVehicleType) {
      return fail("Vehicle name, plate number, and type are required.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const payload = {
        name: normalizedName,
        plate_number: normalizedPlateNumber,
        vehicle_type: normalizedVehicleType,
        maintenance_due_km: params.maintenanceDueKm ?? null,
      };

      const { data, error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", params.vehicleId)
        .select(VEHICLE_SELECT_FIELDS)
        .maybeSingle();

      if (error && isMissingImagePathColumn(error.message)) {
        const fallback = await supabase
          .from("vehicles")
          .update(payload)
          .eq("id", params.vehicleId)
          .select(VEHICLE_SELECT_FIELDS_LEGACY)
          .maybeSingle();

        if (fallback.error) {
          return fail(fallback.error.message);
        }

        if (!fallback.data) {
          return fail("Vehicle not found.");
        }

        const vehicle = mapVehicleDbRow({
          ...fallback.data,
          image_path: null,
        });

        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "vehicle.update",
          entityType: "vehicle",
          entityId: params.vehicleId,
          details: {
            name: vehicle.name,
            plate: vehicle.plateNumber,
            type: vehicle.vehicleType,
            maintenanceDueKm: vehicle.maintenanceDueKm,
          },
        });

        return ok(vehicle);
      }

      if (error) {
        return fail(error.message);
      }

      if (!data) {
        return fail("Vehicle not found.");
      }

      const vehicle = mapVehicleDbRow(data);

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "vehicle.update",
        entityType: "vehicle",
        entityId: params.vehicleId,
        details: {
          name: vehicle.name,
          plate: vehicle.plateNumber,
          type: vehicle.vehicleType,
          maintenanceDueKm: vehicle.maintenanceDueKm,
        },
      });

      return ok(vehicle);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to update vehicle.");
    }
  }

  static async moveVehicleFactionForAdmin(params: {
    vehicleId: string;
    targetFaction: string;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<Vehicle>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = fixPossiblyMojibake(params.targetFaction.trim());
    if (!isSupportedFaction(normalizedFaction)) {
      return fail("Unsupported faction.");
    }

    try {
      const supabase = getSupabaseClient() as any;

      const { data: currentRow, error: currentError } = await supabase
        .from("vehicles")
        .select("id, faction")
        .eq("id", params.vehicleId)
        .maybeSingle();

      if (currentError) {
        return fail(currentError.message);
      }

      if (!currentRow) {
        return fail("Vehicle not found.");
      }

      const previousFaction = fixPossiblyMojibake((currentRow.faction ?? "").trim());

      const { data, error } = await supabase
        .from("vehicles")
        .update({ faction: normalizedFaction })
        .eq("id", params.vehicleId)
        .select(VEHICLE_SELECT_FIELDS)
        .maybeSingle();

      if (error && isMissingImagePathColumn(error.message)) {
        const fallback = await supabase
          .from("vehicles")
          .update({ faction: normalizedFaction })
          .eq("id", params.vehicleId)
          .select(VEHICLE_SELECT_FIELDS_LEGACY)
          .maybeSingle();

        if (fallback.error) {
          return fail(fallback.error.message);
        }

        if (!fallback.data) {
          return fail("Vehicle not found.");
        }

        const vehicle = mapVehicleDbRow({
          ...fallback.data,
          image_path: null,
        });

        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "vehicle.move_faction",
          entityType: "vehicle",
          entityId: params.vehicleId,
          details: {
            previousFaction,
            targetFaction: vehicle.faction,
          },
        });

        return ok(vehicle);
      }

      if (error) {
        return fail(error.message);
      }

      if (!data) {
        return fail("Vehicle not found.");
      }

      const vehicle = mapVehicleDbRow(data);

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "vehicle.move_faction",
        entityType: "vehicle",
        entityId: params.vehicleId,
        details: {
          previousFaction,
          targetFaction: vehicle.faction,
        },
      });

      return ok(vehicle);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to move vehicle faction.");
    }
  }

  static async getVehicleDeleteImpact(vehicleId: string): Promise<ServiceResult<{ fuelEntriesCount: number }>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { count, error } = await supabase
        .from("fuel_entries")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", vehicleId);

      if (error) {
        return fail(error.message);
      }

      return ok({ fuelEntriesCount: count ?? 0 });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to inspect vehicle dependencies.");
    }
  }

  static async deleteVehicleForAdmin(params: {
    vehicleId: string;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<{ deletedFuelEntriesCount: number }>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data: row, error: rowError } = await supabase
        .from("vehicles")
        .select("id, faction, name, plate_number, image_path")
        .eq("id", params.vehicleId)
        .maybeSingle();

      if (rowError) {
        return fail(rowError.message);
      }

      if (!row) {
        return fail("Vehicle not found.");
      }

      const impact = await this.getVehicleDeleteImpact(params.vehicleId);
      if (impact.error) {
        return fail(impact.error);
      }
      const deletedFuelEntriesCount = impact.data?.fuelEntriesCount ?? 0;

      const { error: deleteError } = await supabase.from("vehicles").delete().eq("id", params.vehicleId);
      if (deleteError) {
        return fail(deleteError.message);
      }

      if (isStoragePath(row.image_path)) {
        await supabase.storage.from("vehicle-images").remove([row.image_path]);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "vehicle.delete",
        entityType: "vehicle",
        entityId: params.vehicleId,
        details: {
          faction: row.faction,
          name: row.name,
          plate: row.plate_number,
          deletedFuelEntriesCount,
        },
      });

      return ok({ deletedFuelEntriesCount });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to delete vehicle.");
    }
  }
}
