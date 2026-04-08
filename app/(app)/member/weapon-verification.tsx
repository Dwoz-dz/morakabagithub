import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import SignatureCanvas from "react-native-signature-canvas";

import { WEAPON_SUBMISSION_STATUSES, type WeaponSubmission } from "@/src/models";
import {
  resolveStoragePathOrUrl,
  uploadDataUrlToBucket,
  uploadFileToBucket,
} from "@/src/services/supabase/storage.service";
import { WeaponService } from "@/src/services/supabase/weapon.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";
import { pickSingleImage, type PickedImageResult } from "@/src/utils/image-picker";

const todayIso = () => new Date().toISOString().slice(0, 10);

const statusLabel = (status: string): string => {
  if (status === WEAPON_SUBMISSION_STATUSES.REVIEWED) return "مقبول";
  if (status === WEAPON_SUBMISSION_STATUSES.REJECTED) return "مرفوض";
  return "قيد المراجعة";
};

const statusMessage = (status: string): string | null => {
  if (status === WEAPON_SUBMISSION_STATUSES.REVIEWED) {
    return "لقد تم قبول مراقبة سلاحك";
  }

  if (status === WEAPON_SUBMISSION_STATUSES.REJECTED) {
    return "تم رفض مراقبة سلاحك، توجه إلى المكتب للمراقبة";
  }

  return null;
};

export default function WeaponVerificationScreen() {
  const employee = useAuthStore((state) => state.employee);

  const signatureRef = useRef<any>(null);

  const [weaponType, setWeaponType] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [checkDate, setCheckDate] = useState(todayIso());
  const [signatureName, setSignatureName] = useState(employee?.fullName ?? "");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [weaponImage, setWeaponImage] = useState<PickedImageResult | null>(null);

  const [recentSubmissions, setRecentSubmissions] = useState<WeaponSubmission[]>([]);
  const [weaponImageUrls, setWeaponImageUrls] = useState<Record<string, string>>({});
  const [signatureImageUrls, setSignatureImageUrls] = useState<Record<string, string>>({});
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latestDecision = useMemo(
    () => recentSubmissions.find((item) => item.status !== WEAPON_SUBMISSION_STATUSES.PENDING) ?? null,
    [recentSubmissions],
  );

  const loadRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    setError(null);

    const result = await WeaponService.listForCurrentUser(8);
    if (result.error) {
      setError(result.error);
      setRecentSubmissions([]);
      setWeaponImageUrls({});
      setSignatureImageUrls({});
      setIsLoadingRecent(false);
      return;
    }

    const items = result.data ?? [];
    setRecentSubmissions(items);

    const imageEntries = await Promise.all(
      items
        .filter((item) => item.imagePath)
        .map(async (item) => {
          const signed = await resolveStoragePathOrUrl({
            bucket: "weapon-checks",
            pathOrUrl: item.imagePath as string,
            expiresIn: 3600,
          });

          return [item.id, signed.url] as const;
        }),
    );

    const signatureEntries = await Promise.all(
      items
        .filter((item) => item.signaturePath)
        .map(async (item) => {
          const signed = await resolveStoragePathOrUrl({
            bucket: "weapon-checks",
            pathOrUrl: item.signaturePath as string,
            expiresIn: 3600,
          });

          return [item.id, signed.url] as const;
        }),
    );

    const imageMap: Record<string, string> = {};
    imageEntries.forEach(([id, url]) => {
      if (url) imageMap[id] = url;
    });

    const signatureMap: Record<string, string> = {};
    signatureEntries.forEach(([id, url]) => {
      if (url) signatureMap[id] = url;
    });

    setWeaponImageUrls(imageMap);
    setSignatureImageUrls(signatureMap);
    setIsLoadingRecent(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecent();
    }, [loadRecent]),
  );

  const pickImage = useCallback(async () => {
    const picked = await pickSingleImage();
    if (!picked) {
      return;
    }

    setWeaponImage(picked);
    setError(null);
    setSuccess(null);
  }, []);

  const clearSignature = useCallback(() => {
    signatureRef.current?.clearSignature();
    setSignatureDataUrl(null);
  }, []);

  const submit = useCallback(async () => {
    if (!employee?.id || !employee?.authUserId || !employee?.faction) {
      setError("ملف الموظف غير مكتمل.");
      return;
    }

    if (!weaponType.trim()) {
      setError("نوع السلاح مطلوب.");
      return;
    }

    if (!signatureDataUrl) {
      setError("يرجى إضافة الإمضاء الحقيقي قبل الإرسال.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    let imagePath: string | null = null;
    let signaturePath: string | null = null;

    if (weaponImage?.uri) {
      const uploadResult = await uploadFileToBucket({
        bucket: "weapon-checks",
        userId: employee.authUserId,
        fileUri: weaponImage.uri,
        fileName: weaponImage.fileName || `weapon-${Date.now()}.jpg`,
        contentType: weaponImage.mimeType ?? "image/jpeg",
      });

      if (uploadResult.error || !uploadResult.path) {
        setError(uploadResult.error ?? "تعذر رفع صورة السلاح.");
        setIsSubmitting(false);
        return;
      }

      imagePath = uploadResult.path;
    }

    const signatureUpload = await uploadDataUrlToBucket({
      bucket: "weapon-checks",
      userId: employee.authUserId,
      dataUrl: signatureDataUrl,
      fileName: "signature.png",
      filePath: `${employee.authUserId}/signature.png`,
      contentType: "image/png",
      upsert: true,
    });

    if (signatureUpload.error || !signatureUpload.path) {
      setError(signatureUpload.error ?? "تعذر رفع صورة الإمضاء.");
      setIsSubmitting(false);
      return;
    }

    signaturePath = signatureUpload.path;

    const result = await WeaponService.createSubmission({
      employeeId: employee.id,
      faction: employee.faction,
      weaponType,
      serialNumber: serialNumber.trim() || null,
      checkDate,
      imagePath,
      signaturePath,
      signatureName: signatureName.trim() || employee.fullName,
      notes: notes.trim() || null,
      actorAuthUserId: employee.authUserId,
    });

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setSuccess("تم إرسال فحص السلاح بنجاح.");
    setWeaponType("");
    setSerialNumber("");
    setNotes("");
    setWeaponImage(null);
    clearSignature();
    setIsSubmitting(false);
    await loadRecent();
  }, [
    checkDate,
    clearSignature,
    employee?.authUserId,
    employee?.faction,
    employee?.fullName,
    employee?.id,
    notes,
    serialNumber,
    signatureDataUrl,
    signatureName,
    weaponImage,
    weaponType,
    loadRecent,
  ]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>فحص السلاح</Text>
        <Text style={styles.subtitle}>أدخل معلومات السلاح وارفع صورة وإمضاء حقيقي قبل الإرسال.</Text>

        {latestDecision ? (
          <View
            style={[
              styles.decisionBanner,
              latestDecision.status === WEAPON_SUBMISSION_STATUSES.REVIEWED && styles.decisionBannerSuccess,
              latestDecision.status === WEAPON_SUBMISSION_STATUSES.REJECTED && styles.decisionBannerDanger,
            ]}
          >
            <Text
              style={[
                styles.decisionBannerText,
                latestDecision.status === WEAPON_SUBMISSION_STATUSES.REVIEWED && styles.decisionBannerTextSuccess,
                latestDecision.status === WEAPON_SUBMISSION_STATUSES.REJECTED && styles.decisionBannerTextDanger,
              ]}
            >
              {statusMessage(latestDecision.status)}
            </Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          value={weaponType}
          onChangeText={setWeaponType}
          placeholder="نوع السلاح"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          value={serialNumber}
          onChangeText={setSerialNumber}
          placeholder="الرقم التسلسلي (اختياري)"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          value={checkDate}
          onChangeText={setCheckDate}
          placeholder="تاريخ الفحص YYYY-MM-DD"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          value={signatureName}
          onChangeText={setSignatureName}
          placeholder="الاسم الكامل (كتوقيع نصي إضافي)"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="ملاحظات إضافية"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          multiline
        />

        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]} onPress={() => void pickImage()}>
          <Text style={styles.secondaryButtonText}>{weaponImage ? "تغيير صورة السلاح" : "اختيار صورة السلاح"}</Text>
        </Pressable>

        {weaponImage?.uri ? <Image source={{ uri: weaponImage.uri }} style={styles.previewImage} contentFit="cover" /> : null}

        <Text style={styles.label}>الإمضاء الحقيقي</Text>
        <View style={styles.signaturePadWrap}>
          <SignatureCanvas
            ref={signatureRef}
            onOK={(signature) => {
              setSignatureDataUrl(signature);
              setError(null);
            }}
            onEmpty={() => setSignatureDataUrl(null)}
            descriptionText="وقّع داخل الإطار"
            clearText="مسح"
            confirmText="اعتماد الإمضاء"
            autoClear={false}
            backgroundColor="#FFFFFF"
            webStyle={`
              .m-signature-pad--footer {display: flex; justify-content: space-between; margin-top: 8px;}
              .m-signature-pad--footer .button {background-color: #0B5FA5; color: #fff; border-radius: 6px;}
              body,html {width: 100%; height: 100%;}
            `}
          />
        </View>

        {signatureDataUrl ? <Image source={{ uri: signatureDataUrl }} style={styles.signaturePreview} contentFit="contain" /> : null}

        <Pressable style={({ pressed }) => [styles.clearSignatureButton, pressed && styles.buttonPressed]} onPress={clearSignature}>
          <Text style={styles.clearSignatureButtonText}>مسح الإمضاء</Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            isSubmitting && styles.buttonDisabled,
            pressed && !isSubmitting && styles.buttonPressed,
          ]}
          disabled={isSubmitting}
          onPress={() => void submit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>إرسال الفحص</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>آخر الإرسالات</Text>

        {isLoadingRecent ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل السجل...</Text>
          </View>
        ) : null}

        {!isLoadingRecent && recentSubmissions.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد إرسالات سابقة.</Text>
        ) : null}

        {recentSubmissions.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{item.weaponType}</Text>
              <View
                style={[
                  styles.statusChip,
                  item.status === WEAPON_SUBMISSION_STATUSES.REVIEWED && styles.statusChipSuccess,
                  item.status === WEAPON_SUBMISSION_STATUSES.REJECTED && styles.statusChipDanger,
                ]}
              >
                <Text style={styles.statusChipText}>{statusLabel(item.status)}</Text>
              </View>
            </View>

            {statusMessage(item.status) ? (
              <Text
                style={[
                  styles.rowStatusMessage,
                  item.status === WEAPON_SUBMISSION_STATUSES.REVIEWED && styles.rowStatusMessageSuccess,
                  item.status === WEAPON_SUBMISSION_STATUSES.REJECTED && styles.rowStatusMessageDanger,
                ]}
              >
                {statusMessage(item.status)}
              </Text>
            ) : null}

            <Text style={styles.rowMeta}>{formatDateTime(new Date(item.createdAt))}</Text>

            {weaponImageUrls[item.id] ? (
              <Image source={{ uri: weaponImageUrls[item.id] }} style={styles.smallPreviewImage} contentFit="cover" />
            ) : null}

            {signatureImageUrls[item.id] ? (
              <Image source={{ uri: signatureImageUrls[item.id] }} style={styles.smallSignatureImage} contentFit="contain" />
            ) : null}
          </View>
        ))}
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
  label: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  decisionBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
  },
  decisionBannerSuccess: {
    backgroundColor: "#E8F7EE",
    borderColor: "#98D5AE",
  },
  decisionBannerDanger: {
    backgroundColor: "#FDEDED",
    borderColor: "#F1A7A7",
  },
  decisionBannerText: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
  },
  decisionBannerTextSuccess: {
    color: "#0E6C3A",
  },
  decisionBannerTextDanger: {
    color: "#B42318",
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
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: palette.text,
    fontWeight: "700",
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  signaturePadWrap: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  signaturePreview: {
    width: "100%",
    height: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#FFFFFF",
  },
  clearSignatureButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E0A4A4",
    backgroundColor: "#FFF3F3",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  clearSignatureButtonText: {
    color: "#9B2C2C",
    fontWeight: "700",
  },
  submitButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.6,
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
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  loadingBox: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: palette.textMuted,
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: spacing.sm,
    gap: 6,
  },
  rowHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    flex: 1,
  },
  statusChip: {
    borderRadius: 999,
    backgroundColor: "#E8EEF8",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusChipSuccess: {
    backgroundColor: "#E7F6ED",
  },
  statusChipDanger: {
    backgroundColor: "#FDECEC",
  },
  statusChipText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  rowStatusMessage: {
    textAlign: "right",
    fontWeight: "700",
  },
  rowStatusMessageSuccess: {
    color: "#0E6C3A",
  },
  rowStatusMessageDanger: {
    color: "#B42318",
  },
  rowMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  smallPreviewImage: {
    width: "100%",
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  smallSignatureImage: {
    width: "100%",
    height: 90,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#FFFFFF",
  },
});
