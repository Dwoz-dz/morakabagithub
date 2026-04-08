import { normalizeTextDeep } from "@/src/utils/text-normalization";

export interface FactionMessageRead {
  employeeId: string;
  faction: string;
  lastReadAt: string;
  updatedAt: string;
}

export interface FactionMessageReadDbRow {
  employee_id: string;
  faction: string;
  last_read_at: string;
  updated_at: string;
}

export const mapFactionMessageReadDbRow = (row: FactionMessageReadDbRow): FactionMessageRead => {
  const normalized = normalizeTextDeep(row);

  return {
    employeeId: normalized.employee_id,
    faction: normalized.faction,
    lastReadAt: normalized.last_read_at,
    updatedAt: normalized.updated_at,
  };
};
