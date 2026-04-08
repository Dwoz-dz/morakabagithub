import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmployeesService } from "@/src/services/supabase/employees.service";
import { resolveStoragePathOrUrl, uploadFileToBucket } from "@/src/services/supabase/storage.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { pickSingleImage, type PickedImageResult } from "@/src/utils/image-picker";

export default function MemberProfileScreen() {
  const employee = useAuthStore((state) => state.employee);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  const [fullName, setFullName] = useState(employee?.fullName ?? "");
  const [avatarFile, setAvatarFile] = useState<PickedImageResult | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setFullName(employee?.fullName ?? "");

      const run = async () => {
        if (!employee?.authUserId) {
          await bootstrap();
          return;
        }

        if (!employee?.avatarUrl) {
          setAvatarPreviewUrl(null);
          return;
        }

        const result = await resolveStoragePathOrUrl({
          bucket: "profile-avatars",
          pathOrUrl: employee.avatarUrl,
          expiresIn: 3600,
        });

        setAvatarPreviewUrl(result.url ?? null);
      };

      void run();
    }, [bootstrap, employee?.authUserId, employee?.avatarUrl, employee?.fullName]),
  );

  const pickAvatar = useCallback(async () => {
    const picked = await pickSingleImage();
    if (!picked) {
      return;
    }

    setAvatarFile(picked);
    setAvatarPreviewUrl(picked.uri);
    setError(null);
    setSuccess(null);
  }, []);

  const saveProfile = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من المستخدم الحالي.");
      return;
    }

    if (!fullName.trim()) {
      setError("الاسم الكامل مطلوب.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    let avatarPath: string | null | undefined = undefined;

    if (avatarFile?.uri) {
      const uploadResult = await uploadFileToBucket({
        bucket: "profile-avatars",
        userId: employee.authUserId,
        fileUri: avatarFile.uri,
        fileName: "avatar.jpg",
        filePath: `${employee.authUserId}/avatar.jpg`,
        contentType: avatarFile.mimeType ?? "image/jpeg",
        upsert: true,
      });

      if (uploadResult.error || !uploadResult.path) {
        setError(uploadResult.error ?? "تعذر رفع الصورة الشخصية.");
        setIsSaving(false);
        return;
      }

      avatarPath = uploadResult.path;
    }

    const result = await EmployeesService.updateOwnProfile({
      authUserId: employee.authUserId,
      fullName,
      ...(employee.id ? { employeeId: employee.id } : {}),
      ...(avatarPath !== undefined ? { avatarUrl: avatarPath } : {}),
    });

    if (result.error) {
      setError(result.error);
      setIsSaving(false);
      return;
    }

    setSuccess("تم تحديث الملف الشخصي.");
    setAvatarFile(null);
    setFullName(result.data?.fullName ?? fullName);

    if (result.data?.avatarUrl) {
      const resolvedAvatar = await resolveStoragePathOrUrl({
        bucket: "profile-avatars",
        pathOrUrl: result.data.avatarUrl,
        expiresIn: 3600,
      });
      setAvatarPreviewUrl(resolvedAvatar.url ?? avatarPreviewUrl);
    }

    setIsSaving(false);
    await bootstrap();
  }, [avatarFile, avatarPreviewUrl, bootstrap, employee?.authUserId, employee?.id, fullName]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>ملفي الشخصي</Text>
        <Text style={styles.subtitle}>تحديث الاسم والصورة الشخصية الخاصة بك.</Text>

        <View style={styles.avatarWrap}>
          {avatarPreviewUrl ? (
            <Image source={{ uri: avatarPreviewUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>{(employee?.fullName ?? "?").slice(0, 1)}</Text>
            </View>
          )}

          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]} onPress={() => void pickAvatar()}>
            <Text style={styles.secondaryButtonText}>اختيار صورة</Text>
          </Pressable>
        </View>

        <Text style={styles.metaText}>البريد: {employee?.email ?? "--"}</Text>
        <Text style={styles.metaText}>الفصيلة: {employee?.faction ?? "--"}</Text>

        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="الاسم الكامل"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.saveButton, isSaving && styles.buttonDisabled, pressed && !isSaving && styles.buttonPressed]}
          disabled={isSaving}
          onPress={() => void saveProfile()}
        >
          {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>حفظ التغييرات</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.background,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
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
  avatarWrap: {
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCE8F8",
    borderWidth: 1,
    borderColor: palette.line,
  },
  avatarPlaceholderText: {
    color: palette.primaryDark,
    fontSize: 38,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: palette.text,
    fontWeight: "700",
  },
  metaText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.text,
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
  saveButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
