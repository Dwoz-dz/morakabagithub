import { normalizeTextDeep } from "@/src/utils/text-normalization";

export const WEAPON_SUBMISSION_STATUSES = {
  PENDING: "pending",
  REVIEWED: "reviewed",
  REJECTED: "rejected",
} as const;

export type WeaponSubmissionStatus =
  (typeof WEAPON_SUBMISSION_STATUSES)[keyof typeof WEAPON_SUBMISSION_STATUSES];

export interface WeaponSubmission {
  id: string;
  employeeId: string;
  faction: string;
  weaponType: string;
  serialNumber: string | null;
  checkDate: string;
  imagePath: string | null;
  signaturePath: string | null;
  signatureName: string | null;
  notes: string | null;
  status: WeaponSubmissionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeaponSubmissionDbRow {
  id: string;
  employee_id: string;
  faction: string;
  weapon_type: string;
  serial_number: string | null;
  check_date: string;
  image_path: string | null;
  signature_path: string | null;
  signature_name: string | null;
  notes: string | null;
  status: WeaponSubmissionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const mapWeaponSubmissionDbRow = (row: WeaponSubmissionDbRow): WeaponSubmission => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    employeeId: normalizedRow.employee_id,
    faction: normalizedRow.faction,
    weaponType: normalizedRow.weapon_type,
    serialNumber: normalizedRow.serial_number ?? null,
    checkDate: normalizedRow.check_date,
    imagePath: normalizedRow.image_path ?? null,
    signaturePath: normalizedRow.signature_path ?? null,
    signatureName: normalizedRow.signature_name ?? null,
    notes: normalizedRow.notes ?? null,
    status: normalizedRow.status,
    reviewedBy: normalizedRow.reviewed_by ?? null,
    reviewedAt: normalizedRow.reviewed_at ?? null,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};
