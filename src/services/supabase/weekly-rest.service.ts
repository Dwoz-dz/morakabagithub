import {
  type Employee,
  type WeeklyRestDayKey,
  type WeeklyRestFairnessStat,
  WEEKLY_REST_DAY_LABELS,
  mapWeeklyRestAssignmentDbRow,
  mapWeeklyRestHistoryDbRow,
  type WeeklyRestAssignment,
  type WeeklyRestHistory,
} from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { EmployeesService } from "./employees.service";
import { getSupabaseClient, isSupabaseConfigured, type Database } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

interface AssignWeeklyRestParams {
  employees: Employee[];
  days: WeeklyRestDayKey[];
  weekStartDate: string;
  senderAuthUserId: string;
}

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const addDays = (dateString: string, days: number): string => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatDaysForMessage = (days: WeeklyRestDayKey[]): string =>
  days.map((day) => WEEKLY_REST_DAY_LABELS[day]).join("، ");

export class WeeklyRestService {
  static async listApprovedMembers(): Promise<ServiceResult<Employee[]>> {
    return EmployeesService.listApprovedMembers();
  }

  static async listMyAssignments(limit = 12): Promise<ServiceResult<WeeklyRestAssignment[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("weekly_rest_assignments")
        .select(
          "id, employee_id, faction, days, week_start_date, week_end_date, status, created_by, created_at, updated_at",
        )
        .order("week_start_date", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapWeeklyRestAssignmentDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load weekly rest assignments.");
    }
  }

  static async assignWeeklyRest({
    employees,
    days,
    weekStartDate,
    senderAuthUserId,
  }: AssignWeeklyRestParams): Promise<ServiceResult<WeeklyRestAssignment[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    if (employees.length === 0) {
      return fail("Select at least one employee.");
    }

    if (days.length === 0) {
      return fail("Select at least one rest day.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const weekEndDate = addDays(weekStartDate, 6);

      const assignmentRows: Database["public"]["Tables"]["weekly_rest_assignments"]["Insert"][] =
        employees.map((employee) => ({
          employee_id: employee.id,
          faction: fixPossiblyMojibake(employee.faction ?? "unassigned"),
          days,
          week_start_date: weekStartDate,
          week_end_date: weekEndDate,
          status: "active",
          created_by: senderAuthUserId,
        }));

      const assignmentsResult = await supabase
        .from("weekly_rest_assignments")
        .upsert(assignmentRows, {
          onConflict: "employee_id,week_start_date",
        })
        .select(
          "id, employee_id, faction, days, week_start_date, week_end_date, status, created_by, created_at, updated_at",
        );

      if (assignmentsResult.error) {
        return fail(assignmentsResult.error.message);
      }

      const assignments = (assignmentsResult.data ?? []).map(mapWeeklyRestAssignmentDbRow);
      if (assignments.length === 0) {
        return fail("No assignments were created.");
      }

      const assignmentByEmployeeId = new Map<string, WeeklyRestAssignment>();
      assignments.forEach((assignment: WeeklyRestAssignment) => {
        assignmentByEmployeeId.set(assignment.employeeId, assignment);
      });

      const historyRows: Database["public"]["Tables"]["weekly_rest_history"]["Insert"][] = employees
        .map((employee) => {
          const assignment = assignmentByEmployeeId.get(employee.id);
          if (!assignment) {
            return null;
          }

          return {
            assignment_id: assignment.id,
            employee_id: employee.id,
            action: "assigned",
            faction: assignment.faction,
            days: assignment.days,
            week_start_date: assignment.weekStartDate,
            week_end_date: assignment.weekEndDate,
            created_by: senderAuthUserId,
          };
        })
        .filter(Boolean) as Database["public"]["Tables"]["weekly_rest_history"]["Insert"][];

      if (historyRows.length > 0) {
        const historyResult = await supabase.from("weekly_rest_history").insert(historyRows);
        if (historyResult.error) {
          console.error("[weekly-rest] failed to insert history rows", historyResult.error.message);
        }
      }

      const notificationMessage = fixPossiblyMojibake(`تم تحديد راحتك الأسبوعية للأيام: ${formatDaysForMessage(days)}.`);
      const notificationRows = employees.map((employee) => ({
        sender_auth_user_id: senderAuthUserId,
        target_auth_user_id: employee.authUserId,
        title: fixPossiblyMojibake("الراحة الأسبوعية"),
        message: notificationMessage,
        type: "weekly_rest",
        target_type: "user",
        target_faction: null,
        is_read: false,
      }));

      if (notificationRows.length > 0) {
        const notificationResult = await supabase.from("notifications").insert(notificationRows);
        if (notificationResult.error) {
          console.error(
            "[weekly-rest] failed to create weekly rest notifications",
            notificationResult.error.message,
          );
        }
      }

      return ok(assignments);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to assign weekly rest.");
    }
  }

  static async getFairnessStats(limitWeeks = 8): Promise<ServiceResult<WeeklyRestFairnessStat[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const sinceDate = addDays(new Date().toISOString().slice(0, 10), -(limitWeeks * 7));

      const { data, error } = await supabase
        .from("weekly_rest_assignments")
        .select("employee_id, week_start_date, employees(id, full_name, faction)")
        .gte("week_start_date", sinceDate)
        .eq("status", "active");

      if (error) {
        return fail(error.message);
      }

      const map = new Map<string, WeeklyRestFairnessStat>();

      (data ?? []).forEach((row: any) => {
        const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
        if (!employee?.id) {
          return;
        }

        const existing = map.get(employee.id);
        if (existing) {
          existing.assignmentsCount += 1;
          return;
        }

        map.set(employee.id, {
          employeeId: employee.id,
          fullName: fixPossiblyMojibake(employee.full_name),
          faction: employee.faction ? fixPossiblyMojibake(employee.faction) : null,
          assignmentsCount: 1,
        });
      });

      const stats = Array.from(map.values()).sort((a, b) => a.assignmentsCount - b.assignmentsCount);
      return ok(stats);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load fairness stats.");
    }
  }

  static async listFairnessHistory(limit = 120): Promise<ServiceResult<WeeklyRestHistory[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("weekly_rest_history")
        .select(
          "id, assignment_id, employee_id, action, faction, days, week_start_date, week_end_date, created_by, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(Math.max(1, Math.min(limit, 500)));

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapWeeklyRestHistoryDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load fairness history.");
    }
  }

  static async deleteFairnessHistoryRecord(params: {
    historyId: string;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    if (!params.historyId.trim()) {
      return fail("History record id is required.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("weekly_rest_history").delete().eq("id", params.historyId);
      if (error) {
        return fail(error.message);
      }

      await supabase.from("activity_logs").insert({
        actor_auth_user_id: params.actorAuthUserId,
        actor_employee_id: params.actorEmployeeId ?? null,
        action: "weekly_rest.fairness_delete",
        entity_type: "weekly_rest_history",
        entity_id: params.historyId,
        details: {},
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to delete fairness record.");
    }
  }

  static async clearFairnessHistory(params: {
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase.from("weekly_rest_history").select("id");
      if (error) {
        return fail(error.message);
      }

      const rows = (data ?? []) as { id: string }[];
      if (!rows.length) {
        return ok(0);
      }

      const ids = rows.map((row) => row.id);
      const CHUNK = 250;
      for (let index = 0; index < ids.length; index += CHUNK) {
        const chunk = ids.slice(index, index + CHUNK);
        const { error: deleteError } = await supabase.from("weekly_rest_history").delete().in("id", chunk);
        if (deleteError) {
          return fail(deleteError.message);
        }
      }

      await supabase.from("activity_logs").insert({
        actor_auth_user_id: params.actorAuthUserId,
        actor_employee_id: params.actorEmployeeId ?? null,
        action: "weekly_rest.fairness_clear",
        entity_type: "weekly_rest_history",
        entity_id: null,
        details: {
          deletedCount: ids.length,
        },
      });

      return ok(ids.length);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to clear fairness history.");
    }
  }
}
