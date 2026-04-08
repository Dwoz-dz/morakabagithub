import { normalizeTextDeep } from "@/src/utils/text-normalization";

export const FUEL_ENTRY_STATUSES = {
  PENDING: "pending",
  REVIEWED: "reviewed",
  REJECTED: "rejected",
} as const;

export type FuelEntryStatus = (typeof FUEL_ENTRY_STATUSES)[keyof typeof FUEL_ENTRY_STATUSES];

export interface FuelEntry {
  id: string;
  employeeId: string;
  vehicleId: string;
  faction: string;
  fuelType: string;
  couponDate: string;
  quantityLiters: number;
  distanceKm: number;
  odometerCurrent: number;
  odometerNew: number;
  imagePath: string | null;
  signatureName: string | null;
  notes: string | null;
  status: FuelEntryStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FuelEntryDbRow {
  id: string;
  employee_id: string;
  vehicle_id: string;
  faction: string;
  fuel_type: string;
  coupon_date: string;
  quantity_liters: number;
  distance_km: number;
  odometer_current: number;
  odometer_new: number;
  image_path: string | null;
  signature_name: string | null;
  notes: string | null;
  status: FuelEntryStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const mapFuelEntryDbRow = (row: FuelEntryDbRow): FuelEntry => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    employeeId: normalizedRow.employee_id,
    vehicleId: normalizedRow.vehicle_id,
    faction: normalizedRow.faction,
    fuelType: normalizedRow.fuel_type,
    couponDate: normalizedRow.coupon_date,
    quantityLiters: Number(normalizedRow.quantity_liters ?? 0),
    distanceKm: Number(normalizedRow.distance_km ?? 0),
    odometerCurrent: Number(normalizedRow.odometer_current ?? 0),
    odometerNew: Number(normalizedRow.odometer_new ?? 0),
    imagePath: normalizedRow.image_path ?? null,
    signatureName: normalizedRow.signature_name ?? null,
    notes: normalizedRow.notes ?? null,
    status: normalizedRow.status,
    reviewedBy: normalizedRow.reviewed_by ?? null,
    reviewedAt: normalizedRow.reviewed_at ?? null,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};
