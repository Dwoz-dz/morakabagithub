import { normalizeTextDeep } from "@/src/utils/text-normalization";

export interface ActivityLog {
  id: string;
  actorAuthUserId: string;
  actorEmployeeId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityLogDbRow {
  id: string;
  actor_auth_user_id: string;
  actor_employee_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const mapActivityLogDbRow = (row: ActivityLogDbRow): ActivityLog => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    actorAuthUserId: normalizedRow.actor_auth_user_id,
    actorEmployeeId: normalizedRow.actor_employee_id ?? null,
    action: normalizedRow.action,
    entityType: normalizedRow.entity_type,
    entityId: normalizedRow.entity_id ?? null,
    details: normalizedRow.details ?? {},
    createdAt: normalizedRow.created_at,
  };
};
