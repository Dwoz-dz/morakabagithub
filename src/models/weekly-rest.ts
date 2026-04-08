import { normalizeTextDeep } from "@/src/utils/text-normalization";

export const WEEKLY_REST_DAY_KEYS = [
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;

export type WeeklyRestDayKey = (typeof WEEKLY_REST_DAY_KEYS)[number];

export const WEEKLY_REST_DAY_LABELS: Record<WeeklyRestDayKey, string> = {
  saturday: "السبت",
  sunday: "الأحد",
  monday: "الاثنين",
  tuesday: "الثلاثاء",
  wednesday: "الأربعاء",
  thursday: "الخميس",
  friday: "الجمعة",
};

export interface WeeklyRestAssignment {
  id: string;
  employeeId: string;
  faction: string;
  days: WeeklyRestDayKey[];
  weekStartDate: string;
  weekEndDate: string;
  status: "active" | "cancelled";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyRestAssignmentDbRow {
  id: string;
  employee_id: string;
  faction: string;
  days: WeeklyRestDayKey[];
  week_start_date: string;
  week_end_date: string;
  status: "active" | "cancelled";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklyRestHistory {
  id: string;
  assignmentId: string;
  employeeId: string;
  action: "assigned" | "updated" | "cancelled";
  faction: string;
  days: WeeklyRestDayKey[];
  weekStartDate: string;
  weekEndDate: string;
  createdBy: string;
  createdAt: string;
}

export interface WeeklyRestHistoryDbRow {
  id: string;
  assignment_id: string;
  employee_id: string;
  action: "assigned" | "updated" | "cancelled";
  faction: string;
  days: WeeklyRestDayKey[];
  week_start_date: string;
  week_end_date: string;
  created_by: string;
  created_at: string;
}

export interface WeeklyRestFairnessStat {
  employeeId: string;
  fullName: string;
  faction: string | null;
  assignmentsCount: number;
}

export const mapWeeklyRestAssignmentDbRow = (
  row: WeeklyRestAssignmentDbRow,
): WeeklyRestAssignment => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    employeeId: normalizedRow.employee_id,
    faction: normalizedRow.faction,
    days: normalizedRow.days,
    weekStartDate: normalizedRow.week_start_date,
    weekEndDate: normalizedRow.week_end_date,
    status: normalizedRow.status,
    createdBy: normalizedRow.created_by,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};

export const mapWeeklyRestHistoryDbRow = (row: WeeklyRestHistoryDbRow): WeeklyRestHistory => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    assignmentId: normalizedRow.assignment_id,
    employeeId: normalizedRow.employee_id,
    action: normalizedRow.action,
    faction: normalizedRow.faction,
    days: normalizedRow.days,
    weekStartDate: normalizedRow.week_start_date,
    weekEndDate: normalizedRow.week_end_date,
    createdBy: normalizedRow.created_by,
    createdAt: normalizedRow.created_at,
  };
};
