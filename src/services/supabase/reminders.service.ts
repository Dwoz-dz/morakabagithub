import {
  DEFAULT_REMINDER_CONFIG,
  DEFAULT_SMART_UPDATE_CONFIG,
  type ReminderConfig,
  type ReminderCountdown,
  type ReminderType,
  type SmartUpdateConfig,
} from "@/src/models";

import { ActivityLogsService } from "./activity-logs.service";
import { AppSettingsService } from "./app-settings.service";
import { NotificationsService } from "./notifications.service";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

type ReminderDispatchAudit = Record<string, string>;

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const parseDateOnly = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(`${value.trim()}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const normalizeRoleList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SMART_UPDATE_CONFIG.targetRoles];
  }

  const roles = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);

  return roles.length ? Array.from(new Set(roles)) : [...DEFAULT_SMART_UPDATE_CONFIG.targetRoles];
};

const getMonthlyFuelBonDate = (monthlyFuelBonDay: number | null, now: Date): Date | null => {
  if (!monthlyFuelBonDay || monthlyFuelBonDay < 1 || monthlyFuelBonDay > 28) {
    return null;
  }

  const candidate = new Date(now.getFullYear(), now.getMonth(), monthlyFuelBonDay);
  candidate.setHours(0, 0, 0, 0);
  const today = startOfDay(now);

  if (candidate < today) {
    candidate.setMonth(candidate.getMonth() + 1);
  }

  return candidate;
};

const mapReminderTitle = (type: ReminderType): string => {
  if (type === "oil_change") return "الفيدونج";
  if (type === "weapon_inspection") return "مراقبة السلاح";
  return "إحضار قسيمة الوقود";
};

export class RemindersService {
  static async getReminderConfig(): Promise<ServiceResult<ReminderConfig>> {
    const result = await AppSettingsService.listSettings();
    if (result.error) {
      return fail(result.error);
    }

    const settings = result.data ?? [];
    const raw = settings.find((item) => item.key === "member_reminders")?.value ?? {};

    const oilChangeDateRaw =
      (raw.oilChangeDate as string | undefined) ?? (raw.oilChangeReminderAt as string | undefined) ?? null;
    const weaponInspectionDateRaw =
      (raw.weaponInspectionDate as string | undefined) ??
      (raw.weaponInspectionReminderAt as string | undefined) ??
      null;

    const monthlyFuelBonDayValue =
      typeof raw.monthlyFuelBonDay === "number"
        ? raw.monthlyFuelBonDay
        : typeof raw.monthlyFuelBonDay === "string" && raw.monthlyFuelBonDay.trim()
          ? Number(raw.monthlyFuelBonDay)
          : null;

    const leadDaysRaw = (raw.leadDays ?? {}) as Record<string, unknown>;

    const config: ReminderConfig = {
      oilChangeDate: parseDateOnly(oilChangeDateRaw) ? toDateOnly(parseDateOnly(oilChangeDateRaw) as Date) : null,
      weaponInspectionDate: parseDateOnly(weaponInspectionDateRaw)
        ? toDateOnly(parseDateOnly(weaponInspectionDateRaw) as Date)
        : null,
      monthlyFuelBonDay:
        monthlyFuelBonDayValue && !Number.isNaN(monthlyFuelBonDayValue)
          ? Math.max(1, Math.min(28, Math.round(monthlyFuelBonDayValue)))
          : null,
      leadDays: {
        oilChange:
          typeof leadDaysRaw.oilChange === "number" && leadDaysRaw.oilChange >= 0
            ? Math.round(leadDaysRaw.oilChange)
            : DEFAULT_REMINDER_CONFIG.leadDays.oilChange,
        weaponInspection:
          typeof leadDaysRaw.weaponInspection === "number" && leadDaysRaw.weaponInspection >= 0
            ? Math.round(leadDaysRaw.weaponInspection)
            : DEFAULT_REMINDER_CONFIG.leadDays.weaponInspection,
        monthlyFuelBon:
          typeof leadDaysRaw.monthlyFuelBon === "number" && leadDaysRaw.monthlyFuelBon >= 0
            ? Math.round(leadDaysRaw.monthlyFuelBon)
            : DEFAULT_REMINDER_CONFIG.leadDays.monthlyFuelBon,
      },
    };

    return ok(config);
  }

  static async saveReminderConfig(params: {
    config: ReminderConfig;
    updatedBy: string;
  }): Promise<ServiceResult<boolean>> {
    const value = {
      oilChangeDate: params.config.oilChangeDate,
      weaponInspectionDate: params.config.weaponInspectionDate,
      monthlyFuelBonDay: params.config.monthlyFuelBonDay,
      leadDays: {
        oilChange: params.config.leadDays.oilChange,
        weaponInspection: params.config.leadDays.weaponInspection,
        monthlyFuelBon: params.config.leadDays.monthlyFuelBon,
      },
      updatedAt: new Date().toISOString(),
    };

    return AppSettingsService.upsertSetting({
      key: "member_reminders",
      value,
      updatedBy: params.updatedBy,
    });
  }

  static async resetReminderConfig(updatedBy: string): Promise<ServiceResult<boolean>> {
    return AppSettingsService.upsertSetting({
      key: "member_reminders",
      value: {
        ...DEFAULT_REMINDER_CONFIG,
        updatedAt: new Date().toISOString(),
      },
      updatedBy,
    });
  }

  static buildCountdowns(config: ReminderConfig, now = new Date()): ReminderCountdown[] {
    const today = startOfDay(now);
    const oilChangeDate = parseDateOnly(config.oilChangeDate);
    const weaponInspectionDate = parseDateOnly(config.weaponInspectionDate);
    const monthlyFuelBonDate = getMonthlyFuelBonDate(config.monthlyFuelBonDay, now);

    const rows: { type: ReminderType; date: Date | null; leadDays: number }[] = [
      { type: "oil_change", date: oilChangeDate, leadDays: config.leadDays.oilChange },
      {
        type: "weapon_inspection",
        date: weaponInspectionDate,
        leadDays: config.leadDays.weaponInspection,
      },
      {
        type: "monthly_fuel_bon",
        date: monthlyFuelBonDate,
        leadDays: config.leadDays.monthlyFuelBon,
      },
    ];

    return rows.map((row) => {
      const daysRemaining = row.date ? Math.ceil((row.date.getTime() - today.getTime()) / DAY_MS) : null;

      return {
        type: row.type,
        title: mapReminderTitle(row.type),
        dueDate: row.date ? toDateOnly(row.date) : null,
        daysRemaining,
        isOverdue: typeof daysRemaining === "number" ? daysRemaining < 0 : false,
        leadDays: row.leadDays,
      };
    });
  }

  static async getSmartUpdateConfig(): Promise<ServiceResult<SmartUpdateConfig>> {
    const result = await AppSettingsService.listSettings();
    if (result.error) {
      return fail(result.error);
    }

    const settings = result.data ?? [];
    const raw = settings.find((item) => item.key === "smart_update_config")?.value ?? {};

    const config: SmartUpdateConfig = {
      latestVersion: typeof raw.latestVersion === "string" ? raw.latestVersion.trim() : "",
      minimumRequiredVersion:
        typeof raw.minimumRequiredVersion === "string" ? raw.minimumRequiredVersion.trim() : "",
      title: typeof raw.title === "string" ? raw.title.trim() : "",
      releaseNotes: typeof raw.releaseNotes === "string" ? raw.releaseNotes : "",
      isMandatory: Boolean(raw.isMandatory),
      targetRoles: normalizeRoleList(raw.targetRoles),
      androidUrl: typeof raw.androidUrl === "string" ? raw.androidUrl.trim() : "",
      iosUrl: typeof raw.iosUrl === "string" ? raw.iosUrl.trim() : "",
      isActive: Boolean(raw.isActive),
      publishedAt: typeof raw.publishedAt === "string" && raw.publishedAt.trim() ? raw.publishedAt : null,
    };

    return ok(config);
  }

  static async saveSmartUpdateConfig(params: {
    config: SmartUpdateConfig;
    updatedBy: string;
  }): Promise<ServiceResult<boolean>> {
    return AppSettingsService.upsertSetting({
      key: "smart_update_config",
      value: {
        latestVersion: params.config.latestVersion.trim(),
        minimumRequiredVersion: params.config.minimumRequiredVersion.trim(),
        title: params.config.title.trim(),
        releaseNotes: params.config.releaseNotes,
        isMandatory: Boolean(params.config.isMandatory),
        targetRoles: normalizeRoleList(params.config.targetRoles),
        androidUrl: params.config.androidUrl.trim(),
        iosUrl: params.config.iosUrl.trim(),
        isActive: Boolean(params.config.isActive),
        publishedAt: params.config.isActive
          ? params.config.publishedAt ?? new Date().toISOString()
          : params.config.publishedAt ?? null,
        updatedAt: new Date().toISOString(),
      },
      updatedBy: params.updatedBy,
    });
  }

  static async dispatchDueReminderNotifications(params: {
    senderAuthUserId: string;
    senderEmployeeId?: string | null;
  }): Promise<ServiceResult<{ sent: number; skipped: number }>> {
    const [remindersResult, settingsResult] = await Promise.all([
      this.getReminderConfig(),
      AppSettingsService.listSettings(),
    ]);

    if (remindersResult.error) {
      return fail(remindersResult.error);
    }

    if (settingsResult.error) {
      return fail(settingsResult.error);
    }

    const config = remindersResult.data ?? DEFAULT_REMINDER_CONFIG;
    const settings = settingsResult.data ?? [];
    const auditRaw =
      (settings.find((item) => item.key === "member_reminders_dispatch_audit")?.value?.audit as
        | ReminderDispatchAudit
        | undefined) ?? {};

    const countdowns = this.buildCountdowns(config);
    const nowIso = new Date().toISOString();

    let sent = 0;
    let skipped = 0;
    const nextAudit: ReminderDispatchAudit = { ...auditRaw };

    for (const countdown of countdowns) {
      if (!countdown.dueDate || countdown.daysRemaining === null) {
        skipped += 1;
        continue;
      }

      const shouldSend =
        countdown.daysRemaining === countdown.leadDays || countdown.daysRemaining === 0;

      if (!shouldSend) {
        skipped += 1;
        continue;
      }

      const auditKey = `${countdown.type}:${countdown.dueDate}:${countdown.daysRemaining}`;
      if (nextAudit[auditKey]) {
        skipped += 1;
        continue;
      }

      const message =
        countdown.daysRemaining === 0
          ? `اليوم موعد ${countdown.title}.`
          : `تبقّى ${countdown.daysRemaining} يوم على ${countdown.title}.`;

      const sendResult = await NotificationsService.sendNotification({
        senderAuthUserId: params.senderAuthUserId,
        senderEmployeeId: params.senderEmployeeId ?? null,
        title: "تذكير الموظفين",
        message,
        type: "employee_reminder",
        targetType: "all",
      });

      if (sendResult.error) {
        return fail(sendResult.error);
      }

      sent += 1;
      nextAudit[auditKey] = nowIso;
    }

    if (sent > 0) {
      const entries = Object.entries(nextAudit)
        .sort((a, b) => (a[1] > b[1] ? -1 : 1))
        .slice(0, 500);
      const trimmedAudit: ReminderDispatchAudit = {};
      entries.forEach(([key, value]) => {
        trimmedAudit[key] = value;
      });

      const saveAuditResult = await AppSettingsService.upsertSetting({
        key: "member_reminders_dispatch_audit",
        value: {
          audit: trimmedAudit,
          updatedAt: nowIso,
        },
        updatedBy: params.senderAuthUserId,
      });

      if (saveAuditResult.error) {
        return fail(saveAuditResult.error);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.senderAuthUserId,
        actorEmployeeId: params.senderEmployeeId ?? null,
        action: "reminder.dispatch",
        entityType: "member_reminders",
        entityId: null,
        details: {
          sent,
          skipped,
        },
      });
    }

    return ok({ sent, skipped });
  }
}
