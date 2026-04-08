import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import type { AppUpdate, UpdateTargetRole } from "@/src/models";
import { AppSettingsService } from "@/src/services/supabase/app-settings.service";
import { AppUpdatesService } from "@/src/services/supabase/app-updates.service";
import {
  deleteStorageObjectsFromBucket,
  uploadUpdateApkFile,
} from "@/src/services/supabase/storage.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

type UpdateFormState = {
  editingId: string | null;
  version: string;
  minimumRequiredVersion: string;
  title: string;
  releaseNotesText: string;
  targetRoles: UpdateTargetRole[];
  apkPath: string;
  androidUrl: string;
  iosUrl: string;
  isMandatory: boolean;
  isActive: boolean;
  forceLogoutAfterUpdate: boolean;
  publishedAt: string | null;
};

const DEFAULT_UPDATE_FORM: UpdateFormState = {
  editingId: null,
  version: "",
  minimumRequiredVersion: "",
  title: "",
  releaseNotesText: "",
  targetRoles: ["member"],
  apkPath: "",
  androidUrl: "",
  iosUrl: "",
  isMandatory: false,
  isActive: false,
  forceLogoutAfterUpdate: false,
  publishedAt: null,
};

const roleLabelMap: Record<UpdateTargetRole, string> = {
  member: "الموظفون",
  admin: "المدير",
  all: "الكل",
};

const toReleaseNotesText = (releaseNotes: string[]): string => releaseNotes.join("\n");

const normalizePublisherTargetRoles = (roles: UpdateTargetRole[]): UpdateTargetRole[] => {
  const normalized = roles.filter(
    (role): role is UpdateTargetRole => role === "member" || role === "admin" || role === "all",
  );

  if (!normalized.length) {
    return ["member"];
  }

  const unique = Array.from(new Set(normalized));
  if (unique.includes("all")) {
    return ["all"];
  }

  const hasMember = unique.includes("member");
  const hasAdmin = unique.includes("admin");

  if (hasMember && hasAdmin) {
    return ["all"];
  }

  if (hasAdmin) {
    return ["admin"];
  }

  return ["member"];
};

const parseReleaseNotes = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-•]+/, "").trim())
    .filter(Boolean);

const buildFormFromUpdate = (update: AppUpdate): UpdateFormState => ({
  editingId: update.id,
  version: update.version,
  minimumRequiredVersion: update.minimumRequiredVersion,
  title: update.title,
  releaseNotesText: toReleaseNotesText(update.releaseNotes),
  targetRoles: normalizePublisherTargetRoles(update.targetRoles.length ? update.targetRoles : ["member"]),
  apkPath: update.apkPath ?? "",
  androidUrl: update.androidUrl ?? "",
  iosUrl: update.iosUrl ?? "",
  isMandatory: update.isMandatory,
  isActive: update.isActive,
  forceLogoutAfterUpdate: update.forceLogoutAfterUpdate,
  publishedAt: update.publishedAt,
});

const getStorageFileName = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  const segments = trimmed.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? trimmed;
};

const toggleRole = (roles: UpdateTargetRole[], role: UpdateTargetRole): UpdateTargetRole[] => {
  if (role === "all") {
    return roles.includes("all") ? ["member"] : ["all"];
  }

  const withoutAll = roles.filter((item) => item !== "all");
  if (withoutAll.includes(role)) {
    const next = withoutAll.filter((item) => item !== role);
    return normalizePublisherTargetRoles(next.length ? next : ["member"]);
  }

  return normalizePublisherTargetRoles([...withoutAll, role]);
};

const formatRoles = (roles: UpdateTargetRole[]): string => roles.map((role) => roleLabelMap[role]).join(" • ");

export default function AdminSettingsScreen() {
  const router = useRouter();
  const employee = useAuthStore((state) => state.employee);

  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [termsVersion, setTermsVersion] = useState("1.0");
  const [maintenanceThresholdKm, setMaintenanceThresholdKm] = useState("300");

  const [updateForm, setUpdateForm] = useState<UpdateFormState>(DEFAULT_UPDATE_FORM);
  const [updates, setUpdates] = useState<AppUpdate[]>([]);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);
  const [isUploadingApk, setIsUploadingApk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setUpdateFormPatch = useCallback((patch: Partial<UpdateFormState>) => {
    setUpdateForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const [settingsResult, updatesResult] = await Promise.all([
      AppSettingsService.listSettings(),
      AppUpdatesService.listAdminUpdates(50),
    ]);

    if (settingsResult.error) {
      setError(settingsResult.error);
      setIsLoading(false);
      return;
    }

    if (updatesResult.error) {
      setError(updatesResult.error);
      setIsLoading(false);
      return;
    }

    const settings = settingsResult.data ?? [];
    const appMeta = settings.find((item) => item.key === "app_meta")?.value ?? {};
    const notificationDefaults = settings.find((item) => item.key === "notifications_defaults")?.value ?? {};

    setSupportPhone((appMeta.supportPhone as string | undefined) ?? "");
    setSupportEmail((appMeta.supportEmail as string | undefined) ?? "");
    setTermsVersion((appMeta.termsVersion as string | undefined) ?? "1.0");
    setMaintenanceThresholdKm(String((notificationDefaults.maintenanceThresholdKm as number | undefined) ?? 300));

    const loadedUpdates = updatesResult.data ?? [];
    setUpdates(loadedUpdates);

    setUpdateForm((prev) => {
      if (prev.editingId) {
        const edited = loadedUpdates.find((item) => item.id === prev.editingId);
        if (edited) return buildFormFromUpdate(edited);
      }

      const active = loadedUpdates.find((item) => item.isActive) ?? loadedUpdates[0];
      return active ? buildFormFromUpdate(active) : DEFAULT_UPDATE_FORM;
    });

    const latestSettingsUpdate = settings
      .map((item) => item.updatedAt)
      .sort((a, b) => (a > b ? -1 : 1))[0];
    const latestUpdatePublish = loadedUpdates
      .map((item) => item.updatedAt)
      .sort((a, b) => (a > b ? -1 : 1))[0];

    const latest = [latestSettingsUpdate, latestUpdatePublish]
      .filter(Boolean)
      .sort((a, b) => ((a as string) > (b as string) ? -1 : 1))[0];

    setLastUpdatedAt((latest as string) ?? null);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings]),
  );

  const saveGeneralSettings = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من الجلسة الحالية.");
      return;
    }

    setIsSavingGeneral(true);
    setError(null);
    setSuccess(null);

    const threshold = Number(maintenanceThresholdKm);
    if (Number.isNaN(threshold) || threshold < 0) {
      setError("حد تنبيه الصيانة يجب أن يكون رقمًا صحيحًا غير سالب.");
      setIsSavingGeneral(false);
      return;
    }

    const [metaResult, defaultsResult] = await Promise.all([
      AppSettingsService.upsertSetting({
        key: "app_meta",
        value: {
          supportPhone: supportPhone.trim(),
          supportEmail: supportEmail.trim(),
          termsVersion: termsVersion.trim() || "1.0",
        },
        updatedBy: employee.authUserId,
      }),
      AppSettingsService.upsertSetting({
        key: "notifications_defaults",
        value: {
          maintenanceThresholdKm: threshold,
        },
        updatedBy: employee.authUserId,
      }),
    ]);

    const firstError = metaResult.error ?? defaultsResult.error ?? null;
    if (firstError) {
      setError(firstError);
      setIsSavingGeneral(false);
      return;
    }

    setSuccess("تم حفظ الإعدادات العامة.");
    setIsSavingGeneral(false);
    await loadSettings();
  }, [employee?.authUserId, loadSettings, maintenanceThresholdKm, supportEmail, supportPhone, termsVersion]);

  const pickAndUploadApk = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من الجلسة الحالية.");
      return;
    }

    const version = updateForm.version.trim();
    if (!version) {
      setError("أدخل رقم الإصدار أولًا قبل رفع ملف APK.");
      return;
    }

    setIsUploadingApk(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.android.package-archive", "application/octet-stream"],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsUploadingApk(false);
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError("تعذر قراءة ملف APK المختار.");
        setIsUploadingApk(false);
        return;
      }

      const uploadResult = await uploadUpdateApkFile({
        userId: employee.authUserId,
        fileUri: asset.uri,
        version,
        contentType: asset.mimeType ?? "application/vnd.android.package-archive",
      });

      if (uploadResult.error || !uploadResult.path) {
        setError(uploadResult.error ?? "تعذر رفع ملف APK.");
        setIsUploadingApk(false);
        return;
      }

      const previousApkPath = updateForm.apkPath.trim();
      if (previousApkPath && previousApkPath !== uploadResult.path) {
        void deleteStorageObjectsFromBucket({
          bucket: "app-updates-apk",
          paths: [previousApkPath],
        });
      }

      setUpdateFormPatch({ apkPath: uploadResult.path });
      setSuccess("تم رفع ملف APK إلى Supabase Storage.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر رفع ملف APK.");
    } finally {
      setIsUploadingApk(false);
    }
  }, [employee?.authUserId, setUpdateFormPatch, updateForm.apkPath, updateForm.version]);

  const saveUpdateSettings = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من الجلسة الحالية.");
      return;
    }

    setIsSavingUpdate(true);
    setError(null);
    setSuccess(null);

    const version = updateForm.version.trim();
    const minimumRequiredVersion = updateForm.minimumRequiredVersion.trim();
    const title = updateForm.title.trim();
    const releaseNotes = parseReleaseNotes(updateForm.releaseNotesText);
    const targetRoles = normalizePublisherTargetRoles(updateForm.targetRoles);

    if (!version || !minimumRequiredVersion || !title) {
      setError("يرجى تعبئة: رقم الإصدار والحد الأدنى المطلوب وعنوان التحديث.");
      setIsSavingUpdate(false);
      return;
    }

    if (updateForm.isActive && !updateForm.apkPath.trim()) {
      setError("عند نشر التحديث يجب رفع ملف APK أولًا.");
      setIsSavingUpdate(false);
      return;
    }

    const result = await AppUpdatesService.upsertUpdate({
      id: updateForm.editingId ?? undefined,
      version,
      minimumRequiredVersion,
      title,
      releaseNotes,
      isMandatory: updateForm.isMandatory,
      targetRoles,
      apkPath: updateForm.apkPath.trim() || null,
      androidUrl: updateForm.androidUrl.trim() || null,
      iosUrl: updateForm.iosUrl.trim() || null,
      isActive: updateForm.isActive,
      forceLogoutAfterUpdate: updateForm.forceLogoutAfterUpdate,
      publishedAt: updateForm.isActive ? updateForm.publishedAt : null,
      actorAuthUserId: employee.authUserId,
    });

    if (result.error || !result.data) {
      setError(result.error ?? "تعذر حفظ التحديث.");
      setIsSavingUpdate(false);
      return;
    }

    setSuccess(updateForm.isActive ? "تم حفظ ونشر التحديث بنجاح." : "تم حفظ التحديث كمسودة.");
    setIsSavingUpdate(false);
    setUpdateForm(buildFormFromUpdate(result.data));
    await loadSettings();
  }, [employee?.authUserId, loadSettings, updateForm]);

  const activePreviewText = useMemo(() => {
    if (!updateForm.isActive) return "التحديث محفوظ كمسودة (غير منشور حاليًا).";

    const normalizedRoles = normalizePublisherTargetRoles(updateForm.targetRoles);
    const apkLabel = updateForm.apkPath ? `APK: ${getStorageFileName(updateForm.apkPath)}` : "APK غير مرفوع بعد";
    const baseText = `الإصدار ${updateForm.version || "-"} • موجّه إلى ${formatRoles(normalizedRoles)} • ${
      updateForm.isMandatory ? "إجباري" : "اختياري"
    }`;

    if (employee?.role === "admin") {
      return `${baseText} • المدير يتجاوز شاشة التحديث • ${apkLabel}`;
    }

    return `${baseText} • ${apkLabel}`;
  }, [employee?.role, updateForm.apkPath, updateForm.isActive, updateForm.isMandatory, updateForm.targetRoles, updateForm.version]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>إعدادات النظام</Text>
        <Text style={styles.subtitle}>
          إدارة بيانات التطبيق العامة بالإضافة إلى نظام تحديثات احترافي موجّه للموظفين.
        </Text>

        {lastUpdatedAt ? (
          <Text style={styles.metaText}>آخر تعديل: {formatDateTime(new Date(lastUpdatedAt))}</Text>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الإعدادات...</Text>
          </View>
        ) : null}

        {!isLoading ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>بيانات التطبيق والدعم</Text>
              <TextInput
                style={styles.input}
                value={supportPhone}
                onChangeText={setSupportPhone}
                placeholder="رقم الدعم"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />
              <TextInput
                style={styles.input}
                value={supportEmail}
                onChangeText={setSupportEmail}
                placeholder="بريد الدعم"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={styles.input}
                value={termsVersion}
                onChangeText={setTermsVersion}
                placeholder="نسخة الشروط"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />
              <TextInput
                style={styles.input}
                value={maintenanceThresholdKm}
                onChangeText={setMaintenanceThresholdKm}
                placeholder="حد تنبيه الصيانة (كم)"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                keyboardType="numeric"
              />

              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && !isSavingGeneral && styles.buttonPressed,
                  isSavingGeneral && styles.buttonDisabled,
                ]}
                disabled={isSavingGeneral}
                onPress={() => void saveGeneralSettings()}
              >
                {isSavingGeneral ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>حفظ الإعدادات العامة</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>ناشر تحديثات التطبيق</Text>
                <Pressable
                  style={({ pressed }) => [styles.linkButton, pressed && styles.buttonPressed]}
                  onPress={() => router.push("/(app)/admin/reminders")}
                >
                  <Text style={styles.linkButtonText}>تذكير الموظفين</Text>
                </Pressable>
              </View>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  value={updateForm.version}
                  onChangeText={(value) => setUpdateFormPatch({ version: value })}
                  placeholder="رقم الإصدار (مثال: 2.5.0)"
                  placeholderTextColor={palette.textMuted}
                  textAlign="right"
                />
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  value={updateForm.minimumRequiredVersion}
                  onChangeText={(value) => setUpdateFormPatch({ minimumRequiredVersion: value })}
                  placeholder="الحد الأدنى المطلوب"
                  placeholderTextColor={palette.textMuted}
                  textAlign="right"
                />
              </View>

              <TextInput
                style={styles.input}
                value={updateForm.title}
                onChangeText={(value) => setUpdateFormPatch({ title: value })}
                placeholder="عنوان التحديث"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />

              <TextInput
                style={[styles.input, styles.notesInput]}
                value={updateForm.releaseNotesText}
                onChangeText={(value) => setUpdateFormPatch({ releaseNotesText: value })}
                placeholder="ملاحظات الإصدار (كل سطر نقطة)"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                multiline
              />

              <View style={styles.apkSection}>
                <View style={styles.apkSectionHeader}>
                  <Text style={styles.label}>ملف APK للتوزيع</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.uploadButton,
                      pressed && !isUploadingApk && styles.buttonPressed,
                      isUploadingApk && styles.buttonDisabled,
                    ]}
                    disabled={isUploadingApk}
                    onPress={() => void pickAndUploadApk()}
                  >
                    {isUploadingApk ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.uploadButtonText}>رفع APK من الهاتف</Text>
                    )}
                  </Pressable>
                </View>
                <Text style={styles.apkHelperText}>
                  ارفع ملف APK الجديد إلى Supabase Storage قبل النشر. هذا هو الملف الذي سيصل إلى الموظفين.
                </Text>
                <View style={styles.apkPathBox}>
                  <Text style={styles.apkPathText}>
                    {updateForm.apkPath ? getStorageFileName(updateForm.apkPath) : "لم يتم رفع ملف APK بعد"}
                  </Text>
                </View>
              </View>

              <TextInput
                style={styles.input}
                value={updateForm.androidUrl}
                onChangeText={(value) => setUpdateFormPatch({ androidUrl: value })}
                placeholder="رابط احتياطي لأندرويد"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                autoCapitalize="none"
              />

              <TextInput
                style={styles.input}
                value={updateForm.iosUrl}
                onChangeText={(value) => setUpdateFormPatch({ iosUrl: value })}
                placeholder="رابط احتياطي لـ iOS"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                autoCapitalize="none"
              />

              <Text style={styles.label}>الاستهداف (الفئات)</Text>
              <View style={styles.toggleRow}>
                {(["member", "admin", "all"] as UpdateTargetRole[]).map((role) => {
                  const active = updateForm.targetRoles.includes(role);
                  return (
                    <Pressable
                      key={role}
                      style={({ pressed }) => [
                        styles.toggleChip,
                        active && styles.toggleChipActive,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => setUpdateFormPatch({ targetRoles: toggleRole(updateForm.targetRoles, role) })}
                    >
                      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
                        {roleLabelMap[role]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>خيارات التحديث</Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.toggleChip,
                    updateForm.isMandatory && styles.toggleChipActive,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => setUpdateFormPatch({ isMandatory: !updateForm.isMandatory })}
                >
                  <Text style={[styles.toggleChipText, updateForm.isMandatory && styles.toggleChipTextActive]}>
                    {updateForm.isMandatory ? "إجباري" : "اختياري"}
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.toggleChip,
                    updateForm.isActive && styles.toggleChipActive,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => setUpdateFormPatch({ isActive: !updateForm.isActive })}
                >
                  <Text style={[styles.toggleChipText, updateForm.isActive && styles.toggleChipTextActive]}>
                    {updateForm.isActive ? "منشور" : "مسودة"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.toggleRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.toggleChip,
                    updateForm.forceLogoutAfterUpdate && styles.toggleChipActiveDanger,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() =>
                    setUpdateFormPatch({
                      forceLogoutAfterUpdate: !updateForm.forceLogoutAfterUpdate,
                    })
                  }
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      updateForm.forceLogoutAfterUpdate && styles.toggleChipTextDanger,
                    ]}
                  >
                    {updateForm.forceLogoutAfterUpdate
                      ? "تسجيل خروج إجباري: مفعل"
                      : "تسجيل خروج إجباري: غير مفعل"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>معاينة</Text>
                <Text style={styles.previewText}>{activePreviewText}</Text>
                {updateForm.publishedAt ? (
                  <Text style={styles.previewMeta}>
                    آخر نشر: {formatDateTime(new Date(updateForm.publishedAt))}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                    (isSavingUpdate || isUploadingApk) && styles.buttonDisabled,
                  ]}
                  disabled={isSavingUpdate || isUploadingApk}
                  onPress={() => setUpdateForm(DEFAULT_UPDATE_FORM)}
                >
                  <Text style={styles.secondaryButtonText}>تحديث جديد</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    styles.primaryAction,
                    pressed && !isSavingUpdate && !isUploadingApk && styles.buttonPressed,
                    (isSavingUpdate || isUploadingApk) && styles.buttonDisabled,
                  ]}
                  disabled={isSavingUpdate || isUploadingApk}
                  onPress={() => void saveUpdateSettings()}
                >
                  {isSavingUpdate ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {updateForm.isActive ? "حفظ ونشر التحديث" : "حفظ كمسودة"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>سجل التحديثات</Text>
              {updates.length ? (
                <View style={styles.historyList}>
                  {updates.map((item) => (
                    <View key={item.id} style={styles.historyCard}>
                      <View style={styles.historyHead}>
                        <Text style={styles.historyVersion}>v{item.version}</Text>
                        {item.isActive ? <Text style={styles.activeBadge}>نشط</Text> : null}
                      </View>
                      <Text style={styles.historyLine}>{item.title}</Text>
                      <Text style={styles.historyMeta}>
                        الحد الأدنى: {item.minimumRequiredVersion} • {item.isMandatory ? "إجباري" : "اختياري"}
                      </Text>
                      <Text style={styles.historyMeta}>الفئات: {formatRoles(item.targetRoles)}</Text>
                      <Text style={styles.historyMeta}>
                        APK: {item.apkPath ? getStorageFileName(item.apkPath) : "--"}
                      </Text>
                      <Text style={styles.historyMeta}>
                        تاريخ النشر: {item.publishedAt ? formatDateTime(new Date(item.publishedAt)) : "--"}
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.editButton, pressed && styles.buttonPressed]}
                        onPress={() => setUpdateForm(buildFormFromUpdate(item))}
                      >
                        <Text style={styles.editButtonText}>تعديل</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>لا يوجد سجل تحديثات بعد.</Text>
              )}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.background,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 26,
  },
  subtitle: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 20,
  },
  metaText: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  loadingBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: palette.textMuted,
  },
  section: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 16,
  },
  linkButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  linkButtonText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  row: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  rowInput: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.text,
  },
  notesInput: {
    minHeight: 106,
    textAlignVertical: "top",
  },
  apkSection: {
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#F8FBFF",
    padding: spacing.md,
  },
  apkSectionHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "700",
    marginTop: 2,
  },
  uploadButton: {
    borderRadius: 999,
    backgroundColor: palette.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 128,
  },
  uploadButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  apkHelperText: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  apkPathBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  apkPathText: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  toggleChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#E5F0FF",
  },
  toggleChipActiveDanger: {
    borderColor: palette.danger,
    backgroundColor: "#FFECEF",
  },
  toggleChipText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  toggleChipTextActive: {
    color: palette.primaryDark,
  },
  toggleChipTextDanger: {
    color: palette.danger,
  },
  previewCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.sm,
    gap: 4,
  },
  previewTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 12,
  },
  previewText: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 19,
  },
  previewMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  saveButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    flex: 1,
  },
  primaryAction: {
    marginTop: 0,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: palette.text,
    fontWeight: "700",
  },
  historyList: {
    gap: spacing.sm,
  },
  historyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.sm,
    gap: 4,
  },
  historyHead: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyVersion: {
    color: palette.text,
    fontWeight: "900",
  },
  activeBadge: {
    color: palette.accent,
    fontWeight: "900",
    fontSize: 11,
  },
  historyLine: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
    lineHeight: 19,
  },
  historyMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  editButton: {
    alignSelf: "flex-end",
    marginTop: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  editButtonText: {
    color: palette.primaryDark,
    fontWeight: "800",
    fontSize: 12,
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  errorText: {
    textAlign: "right",
    color: palette.danger,
    fontWeight: "700",
  },
  successText: {
    textAlign: "right",
    color: palette.accent,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});





