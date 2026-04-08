import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
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

import { FUEL_ENTRY_STATUSES, type FuelEntry, type Vehicle } from "@/src/models";
import { FuelService } from "@/src/services/supabase/fuel.service";
import {
  resolveStoragePathOrUrl,
  uploadFileToBucket,
} from "@/src/services/supabase/storage.service";
import { VehiclesService } from "@/src/services/supabase/vehicles.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";
import { pickSingleImage, type PickedImageResult } from "@/src/utils/image-picker";

const todayIso = () => new Date().toISOString().slice(0, 10);

const statusLabel = (status: string): string => {
  if (status === FUEL_ENTRY_STATUSES.REVIEWED) return "مقبول";
  if (status === FUEL_ENTRY_STATUSES.REJECTED) return "مرفوض";
  return "قيد المراجعة";
};

export default function FuelFormScreen() {
  const employee = useAuthStore((state) => state.employee);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleImageUrls, setVehicleImageUrls] = useState<Record<string, string>>({});
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [fuelType, setFuelType] = useState("بنزين");
  const [couponDate, setCouponDate] = useState(todayIso());
  const [quantityLiters, setQuantityLiters] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [odometerCurrent, setOdometerCurrent] = useState("");
  const [signatureName, setSignatureName] = useState(employee?.fullName ?? "");
  const [notes, setNotes] = useState("");
  const [bonImage, setBonImage] = useState<PickedImageResult | null>(null);

  const [recentEntries, setRecentEntries] = useState<FuelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedVehicle = useMemo(
    () => vehicles.find((item) => item.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const [vehiclesResult, fuelResult] = await Promise.all([
      VehiclesService.listAvailableForCurrentUser(),
      FuelService.listForCurrentUser(6),
    ]);

    if (vehiclesResult.error) {
      setError(vehiclesResult.error);
      setVehicles([]);
      setVehicleImageUrls({});
    } else {
      const rawList = vehiclesResult.data ?? [];
      const list = rawList.filter((vehicle) =>
        employee?.faction ? vehicle.faction === employee.faction : true,
      );
      setVehicles(list);
      if ((!selectedVehicleId || !list.some((item) => item.id === selectedVehicleId)) && list.length) {
        setSelectedVehicleId(list[0].id);
        setOdometerCurrent(String(list[0].lastOdometer));
      }

      const imageEntries = await Promise.all(
        list
          .filter((vehicle) => vehicle.imagePath)
          .map(async (vehicle) => {
            const signed = await resolveStoragePathOrUrl({
              bucket: "vehicle-images",
              pathOrUrl: vehicle.imagePath as string,
              expiresIn: 3600,
            });

            return [vehicle.id, signed.url] as const;
          }),
      );

      const imageMap: Record<string, string> = {};
      imageEntries.forEach(([id, url]) => {
        if (url) {
          imageMap[id] = url;
        }
      });
      setVehicleImageUrls(imageMap);
    }

    if (fuelResult.error) {
      setError((prev) => prev ?? fuelResult.error);
      setRecentEntries([]);
    } else {
      setRecentEntries(fuelResult.data ?? []);
    }

    setIsLoading(false);
  }, [employee?.faction, selectedVehicleId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const pickImage = useCallback(async () => {
    const picked = await pickSingleImage();
    if (!picked) {
      return;
    }

    setBonImage(picked);
    setError(null);
    setSuccess(null);
  }, []);

  const submit = useCallback(async () => {
    if (!employee?.id || !employee?.authUserId || !employee?.faction) {
      setError("ملف الموظف غير مكتمل.");
      return;
    }

    if (!selectedVehicleId) {
      setError("يرجى اختيار مركبة.");
      return;
    }

    if (!selectedVehicle || (employee.faction && selectedVehicle.faction !== employee.faction)) {
      setError("المركبة المختارة ليست ضمن فصيلتك.");
      return;
    }

    const liters = Number(quantityLiters);
    const distance = Number(distanceKm);
    const odometer = Number(odometerCurrent);

    if (Number.isNaN(liters) || liters <= 0) {
      setError("الكمية يجب أن تكون أكبر من صفر.");
      return;
    }

    if (Number.isNaN(distance) || distance < 0) {
      setError("المسافة غير صالحة.");
      return;
    }

    if (Number.isNaN(odometer) || odometer < 0) {
      setError("قراءة العداد الحالية غير صالحة.");
      return;
    }

    if (!signatureName.trim()) {
      setError("اسم التوقيع مطلوب.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    let imagePath: string | null = null;

    if (bonImage?.uri) {
      const uploadResult = await uploadFileToBucket({
        bucket: "fuel-bon",
        userId: employee.authUserId,
        fileUri: bonImage.uri,
        fileName: bonImage.fileName || `fuel-${Date.now()}.jpg`,
        contentType: bonImage.mimeType ?? "image/jpeg",
      });

      if (uploadResult.error || !uploadResult.path) {
        setError(uploadResult.error ?? "تعذر رفع صورة القسيمة.");
        setIsSubmitting(false);
        return;
      }

      imagePath = uploadResult.path;
    }

    const result = await FuelService.createEntry({
      employeeId: employee.id,
      faction: employee.faction,
      vehicleId: selectedVehicleId,
      fuelType,
      couponDate,
      quantityLiters: liters,
      distanceKm: distance,
      odometerCurrent: odometer,
      imagePath,
      signatureName: signatureName.trim(),
      notes: notes.trim() || null,
      actorAuthUserId: employee.authUserId,
    });

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setSuccess("تم إرسال استمارة الوقود بنجاح.");
    setQuantityLiters("");
    setDistanceKm("");
    setNotes("");
    setBonImage(null);
    setIsSubmitting(false);

    const vehicle = vehicles.find((item) => item.id === selectedVehicleId);
    if (vehicle) {
      setOdometerCurrent(String(vehicle.lastOdometer + distance));
    }

    await loadData();
  }, [
    bonImage,
    couponDate,
    distanceKm,
    employee?.authUserId,
    employee?.faction,
    employee?.id,
    fuelType,
    loadData,
    notes,
    odometerCurrent,
    quantityLiters,
    selectedVehicle,
    selectedVehicleId,
    signatureName,
    vehicles,
  ]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>استمارة الوقود</Text>
        <Text style={styles.subtitle}>
          اختر مركبة فصيلتك، أدخل بيانات الوقود، ثم أرسل الطلب.
        </Text>

        <Text style={styles.label}>المركبة</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.emptyVehicleText}>لا توجد مركبات متاحة لفصيلتك حاليًا.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vehicleSelectorScroll}
          >
            {vehicles.map((vehicle) => {
              const isSelected = selectedVehicleId === vehicle.id;
              const imageUrl = vehicleImageUrls[vehicle.id];

              return (
                <Pressable
                  key={vehicle.id}
                  style={styles.vehicleCircleItem}
                  onPress={() => {
                    setSelectedVehicleId(vehicle.id);
                    setOdometerCurrent(String(vehicle.lastOdometer));
                  }}
                >
                  <View style={[styles.vehicleCircle, isSelected && styles.vehicleCircleSelected]}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.vehicleCircleImage} contentFit="cover" />
                    ) : (
                      <View style={styles.vehicleCircleFallback}>
                        <Text style={styles.vehicleCircleFallbackText}>{vehicle.name.slice(0, 1)}</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.vehicleCircleLabel, isSelected && styles.vehicleCircleLabelSelected]}
                    numberOfLines={1}
                  >
                    {vehicle.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <TextInput
          style={styles.input}
          value={fuelType}
          onChangeText={setFuelType}
          placeholder="نوع الوقود"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          value={couponDate}
          onChangeText={setCouponDate}
          placeholder="تاريخ القسيمة YYYY-MM-DD"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          value={quantityLiters}
          onChangeText={setQuantityLiters}
          placeholder="الكمية (لتر)"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          keyboardType="numeric"
        />

        <TextInput
          style={styles.input}
          value={distanceKm}
          onChangeText={setDistanceKm}
          placeholder="المسافة (كم)"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          keyboardType="numeric"
        />

        <TextInput
          style={styles.input}
          value={odometerCurrent}
          onChangeText={setOdometerCurrent}
          placeholder="العداد الحالي"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          keyboardType="numeric"
        />

        {selectedVehicle ? (
          <Text style={styles.metaText}>
            عداد المركبة الحالي في النظام: {selectedVehicle.lastOdometer}
          </Text>
        ) : null}

        <TextInput
          style={styles.input}
          value={signatureName}
          onChangeText={setSignatureName}
          placeholder="الاسم الكامل كتوقيع"
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

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={() => void pickImage()}
        >
          <Text style={styles.secondaryButtonText}>
            {bonImage ? "تغيير صورة القسيمة" : "اختيار صورة قسيمة الوقود"}
          </Text>
        </Pressable>

        {bonImage ? <Image source={{ uri: bonImage.uri }} style={styles.previewImage} contentFit="cover" /> : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            (isSubmitting || vehicles.length === 0) && styles.buttonDisabled,
            pressed && !isSubmitting && vehicles.length > 0 && styles.buttonPressed,
          ]}
          disabled={isSubmitting || vehicles.length === 0}
          onPress={() => void submit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>إرسال الاستمارة</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>آخر الإرسالات</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل السجل...</Text>
          </View>
        ) : null}

        {!isLoading && recentEntries.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد إرسالات سابقة.</Text>
        ) : null}

        {recentEntries.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.rowTitle}>
              {entry.fuelType} - {entry.quantityLiters} لتر
            </Text>
            <Text style={styles.rowMeta}>الحالة: {statusLabel(entry.status)}</Text>
            <Text style={styles.rowMeta}>{formatDateTime(new Date(entry.createdAt))}</Text>
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
  },
  emptyVehicleText: {
    textAlign: "right",
    color: palette.warning,
    fontWeight: "700",
  },
  vehicleSelectorScroll: {
    flexDirection: "row-reverse",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  vehicleCircleItem: {
    width: 88,
    alignItems: "center",
    gap: 7,
  },
  vehicleCircle: {
    width: 70,
    height: 70,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
    overflow: "hidden",
  },
  vehicleCircleSelected: {
    borderColor: palette.primary,
    shadowColor: "#0B5FA5",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  vehicleCircleImage: {
    width: "100%",
    height: "100%",
  },
  vehicleCircleFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCE8F8",
  },
  vehicleCircleFallbackText: {
    color: palette.primaryDark,
    fontWeight: "900",
    fontSize: 24,
  },
  vehicleCircleLabel: {
    color: palette.textMuted,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
    width: "100%",
  },
  vehicleCircleLabelSelected: {
    color: palette.primaryDark,
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
  metaText: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
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
    gap: 4,
  },
  rowTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  rowMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
});
