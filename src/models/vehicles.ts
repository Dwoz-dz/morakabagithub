import { normalizeTextDeep } from "@/src/utils/text-normalization";

export interface Vehicle {
  id: string;
  faction: string;
  name: string;
  plateNumber: string;
  vehicleType: string;
  imagePath: string | null;
  isActive: boolean;
  lastOdometer: number;
  maintenanceDueKm: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDbRow {
  id: string;
  faction: string;
  name: string;
  plate_number: string;
  vehicle_type: string;
  image_path: string | null;
  is_active: boolean;
  last_odometer: number;
  maintenance_due_km: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const mapVehicleDbRow = (row: VehicleDbRow): Vehicle => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    faction: normalizedRow.faction,
    name: normalizedRow.name,
    plateNumber: normalizedRow.plate_number,
    vehicleType: normalizedRow.vehicle_type,
    imagePath: normalizedRow.image_path ?? null,
    isActive: normalizedRow.is_active,
    lastOdometer: Number(normalizedRow.last_odometer ?? 0),
    maintenanceDueKm:
      normalizedRow.maintenance_due_km === null ? null : Number(normalizedRow.maintenance_due_km),
    createdBy: normalizedRow.created_by,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};
