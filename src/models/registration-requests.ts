import { normalizeTextDeep } from "@/src/utils/text-normalization";

export const REGISTRATION_REQUEST_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type RegistrationRequestStatus =
  (typeof REGISTRATION_REQUEST_STATUSES)[keyof typeof REGISTRATION_REQUEST_STATUSES];

export interface RegistrationRequest {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  faction: string;
  status: RegistrationRequestStatus;
  createdAt: string;
}

export interface RegistrationRequestDbRow {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  faction: string;
  status: RegistrationRequestStatus;
  created_at: string;
}

export const mapRegistrationRequestDbRow = (
  row: RegistrationRequestDbRow,
): RegistrationRequest => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    authUserId: normalizedRow.auth_user_id,
    fullName: normalizedRow.full_name,
    email: normalizedRow.email,
    faction: normalizedRow.faction,
    status: normalizedRow.status,
    createdAt: normalizedRow.created_at,
  };
};
