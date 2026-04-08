import { create } from "zustand";

import {
  WEEKLY_REST_DAY_KEYS,
  type Employee,
  type WeeklyRestDayKey,
  type WeeklyRestFairnessStat,
} from "@/src/models";
import { WeeklyRestService } from "@/src/services/supabase/weekly-rest.service";

interface WeeklyRestStore {
  allEmployees: Employee[];
  factionFilter: string | "all";
  selectedEmployeeIds: string[];
  selectedDays: WeeklyRestDayKey[];
  weekStartDate: string;
  fairnessStats: WeeklyRestFairnessStat[];
  isLoadingEmployees: boolean;
  isLoadingFairness: boolean;
  isSubmitting: boolean;
  successMessage: string | null;
  error: string | null;

  fetchEmployees: () => Promise<void>;
  fetchFairnessStats: () => Promise<void>;
  setFactionFilter: (faction: string | "all") => void;
  toggleEmployee: (employeeId: string) => void;
  toggleDay: (day: WeeklyRestDayKey) => void;
  assignWeeklyRest: (senderAuthUserId: string) => Promise<boolean>;
  resetSelection: () => void;
  clearError: () => void;
}

export const WEEKLY_REST_DAYS = WEEKLY_REST_DAY_KEYS;

const getWeekStartSaturday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const distanceFromSaturday = (day + 1) % 7;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() - distanceFromSaturday);
  return saturday.toISOString().slice(0, 10);
};

const toggleFromArray = <T>(arr: T[], value: T): T[] =>
  arr.includes(value) ? arr.filter((item) => item !== value) : [...arr, value];

const filteredEmployees = (employees: Employee[], factionFilter: string | "all"): Employee[] => {
  if (factionFilter === "all") {
    return employees;
  }
  return employees.filter((employee) => employee.faction === factionFilter);
};

export const useWeeklyRestStore = create<WeeklyRestStore>()((set, get) => ({
  allEmployees: [],
  factionFilter: "all",
  selectedEmployeeIds: [],
  selectedDays: [],
  weekStartDate: getWeekStartSaturday(),
  fairnessStats: [],
  isLoadingEmployees: false,
  isLoadingFairness: false,
  isSubmitting: false,
  successMessage: null,
  error: null,

  fetchEmployees: async () => {
    set({ isLoadingEmployees: true, error: null });

    const result = await WeeklyRestService.listApprovedMembers();
    if (result.error) {
      set({ isLoadingEmployees: false, error: result.error });
      return;
    }

    const employees = result.data ?? [];
    const selectedEmployeeIds = get().selectedEmployeeIds.filter((employeeId) =>
      employees.some((employee) => employee.id === employeeId),
    );

    set({
      allEmployees: employees,
      selectedEmployeeIds,
      isLoadingEmployees: false,
      error: null,
    });
  },

  fetchFairnessStats: async () => {
    set({ isLoadingFairness: true, error: null });

    const result = await WeeklyRestService.getFairnessStats(8);
    if (result.error) {
      set({ isLoadingFairness: false, error: result.error });
      return;
    }

    set({
      fairnessStats: result.data ?? [],
      isLoadingFairness: false,
      error: null,
    });
  },

  setFactionFilter: (faction) => {
    const employees = get().allEmployees;
    const visibleEmployeeIds = new Set(filteredEmployees(employees, faction).map((employee) => employee.id));

    set((state) => ({
      factionFilter: faction,
      selectedEmployeeIds: state.selectedEmployeeIds.filter((id) => visibleEmployeeIds.has(id)),
      successMessage: null,
    }));
  },

  toggleEmployee: (employeeId) => {
    set((state) => ({
      selectedEmployeeIds: toggleFromArray(state.selectedEmployeeIds, employeeId),
      successMessage: null,
    }));
  },

  toggleDay: (day) => {
    set((state) => ({
      selectedDays: toggleFromArray(state.selectedDays, day),
      successMessage: null,
    }));
  },

  assignWeeklyRest: async (senderAuthUserId) => {
    const {
      allEmployees,
      selectedEmployeeIds,
      selectedDays,
      weekStartDate,
      factionFilter,
      fetchFairnessStats,
    } = get();

    const visibleEmployees = filteredEmployees(allEmployees, factionFilter);
    const targetEmployees = visibleEmployees.filter((employee) =>
      selectedEmployeeIds.includes(employee.id),
    );

    if (targetEmployees.length === 0) {
      set({ error: "يرجى اختيار موظف واحد على الأقل." });
      return false;
    }

    if (selectedDays.length === 0) {
      set({ error: "يرجى اختيار أيام الراحة." });
      return false;
    }

    set({ isSubmitting: true, error: null, successMessage: null });

    const result = await WeeklyRestService.assignWeeklyRest({
      employees: targetEmployees,
      days: selectedDays,
      weekStartDate,
      senderAuthUserId,
    });

    if (result.error) {
      set({ isSubmitting: false, error: result.error });
      return false;
    }

    await fetchFairnessStats();

    set({
      isSubmitting: false,
      successMessage: `تم حفظ الراحة الأسبوعية لـ ${targetEmployees.length} موظف(ين) بنجاح.`,
      selectedEmployeeIds: [],
      selectedDays: [],
      error: null,
    });

    return true;
  },

  resetSelection: () => {
    set({
      selectedEmployeeIds: [],
      selectedDays: [],
      successMessage: null,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
