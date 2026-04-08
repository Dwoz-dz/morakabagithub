
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FACTION_OPTIONS } from "@/src/constants/factions";
import type { Vehicle } from "@/src/models";
import {
  resolveStoragePathOrUrl,
  uploadFileToBucket,
} from "@/src/services/supabase/storage.service";
import { VehiclesService } from "@/src/services/supabase/vehicles.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { pickSingleImage, type PickedImageResult } from "@/src/utils/image-picker";

type ListFactionFilter = "all" | (typeof FACTION_OPTIONS)[number];

const ACTIVE_BADGE = { bg: "#DFF5E8", text: "#0E6C3A" };
const INACTIVE_BADGE = { bg: "#FFE7E7", text: "#A71D2A" };

const parseOptionalKm = (value: string): { value: number | null; error: string | null } => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: "قيمة الصيانة الدورية غير صالحة." };
  }

  return { value: parsed, error: null };
};

export default function VehiclesFactionsAdminScreen() {
  const admin = useAuthStore((state) => state.employee);
  const isAdmin = admin?.role === "admin";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleImageUrls, setVehicleImageUrls] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [listFactionFilter, setListFactionFilter] = useState<ListFactionFilter>("all");

  const [selectedFaction, setSelectedFaction] = useState<string>(FACTION_OPTIONS[0]);
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [maintenanceDueKm, setMaintenanceDueKm] = useState("");
  const [vehicleImage, setVehicleImage] = useState<PickedImageResult | null>(null);

  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [editVehicleType, setEditVehicleType] = useState("");
  const [editMaintenanceDueKm, setEditMaintenanceDueKm] = useState("");

  const [movingVehicleId, setMovingVehicleId] = useState<string | null>(null);
  const [moveTargetFaction, setMoveTargetFaction] = useState<string>(FACTION_OPTIONS[0]);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editingVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === editingVehicleId) ?? null,
    [editingVehicleId, vehicles],
  );
  const movingVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === movingVehicleId) ?? null,
    [movingVehicleId, vehicles],
  );

  const filteredVehicles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      if (listFactionFilter !== "all" && vehicle.faction !== listFactionFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [vehicle.name, vehicle.plateNumber, vehicle.vehicleType, vehicle.faction]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [listFactionFilter, searchQuery, vehicles]);

  const canCreate = useMemo(
    () =>
      Boolean(
        isAdmin &&
          admin?.authUserId &&
          name.trim() &&
          plate.trim() &&
          vehicleType.trim() &&
          selectedFaction.trim(),
      ),
    [admin?.authUserId, isAdmin, name, plate, selectedFaction, vehicleType],
  );

  const canSaveEdit = useMemo(
    () => Boolean(editingVehicleId && editName.trim() && editPlate.trim() && editVehicleType.trim()),
    [editName, editPlate, editVehicleType, editingVehicleId],
  );

  const canApplyMove = useMemo(
    () =>
      Boolean(
        movingVehicleId &&
          moveTargetFaction.trim() &&
          movingVehicle &&
          moveTargetFaction.trim() !== movingVehicle.faction,
      ),
    [moveTargetFaction, movingVehicle, movingVehicleId],
  );

  const runConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: onConfirm },
    ]);
  }, []);

  const resetCreateForm = useCallback(() => {
    setName("");
    setPlate("");
    setVehicleType("");
    setMaintenanceDueKm("");
    setVehicleImage(null);
    setSelectedFaction(FACTION_OPTIONS[0]);
  }, []);

  const loadVehicles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await VehiclesService.listAllForAdmin();
    if (result.error) {
      setError(result.error);
      setVehicles([]);
      setVehicleImageUrls({});
      setIsLoading(false);
      return;
    }

    const rows = result.data ?? [];
    setVehicles(rows);

    const imageEntries = await Promise.all(
      rows
        .filter((item) => item.imagePath)
        .map(async (item) => {
          const signed = await resolveStoragePathOrUrl({
            bucket: "vehicle-images",
            pathOrUrl: item.imagePath as string,
            expiresIn: 3600,
          });
          return [item.id, signed.url] as const;
        }),
    );

    const imageMap: Record<string, string> = {};
    imageEntries.forEach(([id, url]) => {
      if (url) {
        imageMap[id] = url;
      }
    });

    setVehicleImageUrls(imageMap);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadVehicles();
    }, [loadVehicles]),
  );

  const pickVehicleImage = useCallback(async () => {
    const picked = await pickSingleImage();
    if (!picked) {
      return;
    }

    setVehicleImage(picked);
    setError(null);
    setSuccess(null);
  }, []);
  const createVehicle = useCallback(async () => {
    if (!isAdmin || !admin?.authUserId || !canCreate) {
      setError("هذه العملية تتطلب صلاحيات مشرف.");
      return;
    }

    const maintenanceParsed = parseOptionalKm(maintenanceDueKm);
    if (maintenanceParsed.error) {
      setError(maintenanceParsed.error);
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    let imagePath: string | null = null;
    if (vehicleImage?.uri) {
      const uploadResult = await uploadFileToBucket({
        bucket: "vehicle-images",
        userId: admin.authUserId,
        fileUri: vehicleImage.uri,
        fileName: vehicleImage.fileName || `vehicle-${Date.now()}.jpg`,
        contentType: vehicleImage.mimeType ?? "image/jpeg",
      });

      if (uploadResult.error || !uploadResult.path) {
        setError(uploadResult.error ?? "تعذر رفع صورة المركبة.");
        setIsCreating(false);
        return;
      }

      imagePath = uploadResult.path;
    }

    const result = await VehiclesService.createVehicle({
      faction: selectedFaction,
      name,
      plateNumber: plate,
      vehicleType,
      createdBy: admin.authUserId,
      actorEmployeeId: admin.id,
      maintenanceDueKm: maintenanceParsed.value,
      imagePath,
    });

    if (result.error || !result.data) {
      setError(result.error ?? "تعذر إنشاء المركبة.");
      setIsCreating(false);
      return;
    }

    const createdVehicle = result.data;
    setVehicles((prev) => [createdVehicle, ...prev]);
    resetCreateForm();
    setSuccess("تم إنشاء المركبة بنجاح.");

    if (createdVehicle.imagePath) {
      const signed = await resolveStoragePathOrUrl({
        bucket: "vehicle-images",
        pathOrUrl: createdVehicle.imagePath,
        expiresIn: 3600,
      });
      if (signed.url) {
        setVehicleImageUrls((prev) => ({ ...prev, [createdVehicle.id]: signed.url as string }));
      }
    }

    setIsCreating(false);
  }, [
    admin?.authUserId,
    admin?.id,
    canCreate,
    isAdmin,
    maintenanceDueKm,
    name,
    plate,
    resetCreateForm,
    selectedFaction,
    vehicleImage,
    vehicleType,
  ]);

  const startEdit = useCallback((vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setEditName(vehicle.name);
    setEditPlate(vehicle.plateNumber);
    setEditVehicleType(vehicle.vehicleType);
    setEditMaintenanceDueKm(vehicle.maintenanceDueKm === null ? "" : String(vehicle.maintenanceDueKm));
    setMovingVehicleId(null);
    setError(null);
    setSuccess(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingVehicleId(null);
    setEditName("");
    setEditPlate("");
    setEditVehicleType("");
    setEditMaintenanceDueKm("");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!isAdmin || !admin?.authUserId || !editingVehicleId) {
      setError("هذه العملية تتطلب صلاحيات مشرف.");
      return;
    }

    const maintenanceParsed = parseOptionalKm(editMaintenanceDueKm);
    if (maintenanceParsed.error) {
      setError(maintenanceParsed.error);
      return;
    }

    setActionKey(`update:${editingVehicleId}`);
    setError(null);
    setSuccess(null);

    const result = await VehiclesService.updateVehicleForAdmin({
      vehicleId: editingVehicleId,
      name: editName,
      plateNumber: editPlate,
      vehicleType: editVehicleType,
      maintenanceDueKm: maintenanceParsed.value,
      actorAuthUserId: admin.authUserId,
      actorEmployeeId: admin.id,
    });

    if (result.error || !result.data) {
      setError(result.error ?? "تعذر تحديث بيانات المركبة.");
      setActionKey(null);
      return;
    }

    const updated = result.data;
    setVehicles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setSuccess("تم تحديث بيانات المركبة.");
    cancelEdit();
    setActionKey(null);
  }, [
    admin?.authUserId,
    admin?.id,
    cancelEdit,
    editMaintenanceDueKm,
    editName,
    editPlate,
    editVehicleType,
    editingVehicleId,
    isAdmin,
  ]);

  const startMove = useCallback((vehicle: Vehicle) => {
    setMovingVehicleId(vehicle.id);
    setMoveTargetFaction(vehicle.faction);
    setEditingVehicleId(null);
    setError(null);
    setSuccess(null);
  }, []);

  const cancelMove = useCallback(() => {
    setMovingVehicleId(null);
    setMoveTargetFaction(FACTION_OPTIONS[0]);
  }, []);

  const submitMove = useCallback(async () => {
    if (!isAdmin || !admin?.authUserId || !movingVehicle) {
      setError("هذه العملية تتطلب صلاحيات مشرف.");
      return;
    }

    setActionKey(`move:${movingVehicle.id}`);
    setError(null);
    setSuccess(null);

    const result = await VehiclesService.moveVehicleFactionForAdmin({
      vehicleId: movingVehicle.id,
      targetFaction: moveTargetFaction,
      actorAuthUserId: admin.authUserId,
      actorEmployeeId: admin.id,
    });

    if (result.error || !result.data) {
      setError(result.error ?? "تعذر نقل المركبة إلى الفصيلة.");
      setActionKey(null);
      return;
    }

    const moved = result.data;
    setVehicles((prev) => prev.map((item) => (item.id === moved.id ? moved : item)));
    setSuccess(`تم نقل المركبة إلى ${moved.faction}.`);
    cancelMove();
    setActionKey(null);
  }, [admin?.authUserId, admin?.id, cancelMove, isAdmin, moveTargetFaction, movingVehicle]);

  const toggleActive = useCallback(
    async (vehicle: Vehicle) => {
      if (!isAdmin || !admin?.authUserId) {
        setError("هذه العملية تتطلب صلاحيات مشرف.");
        return;
      }

      setActionKey(`toggle:${vehicle.id}`);
      setError(null);
      setSuccess(null);

      const result = await VehiclesService.setVehicleActive({
        vehicleId: vehicle.id,
        isActive: !vehicle.isActive,
        actorAuthUserId: admin.authUserId,
        actorEmployeeId: admin.id,
      });

      if (result.error) {
        setError(result.error);
        setActionKey(null);
        return;
      }

      setVehicles((prev) =>
        prev.map((item) => (item.id === vehicle.id ? { ...item, isActive: !item.isActive } : item)),
      );
      setSuccess(vehicle.isActive ? "تم تعطيل المركبة." : "تم تفعيل المركبة.");
      setActionKey(null);
    },
    [admin?.authUserId, admin?.id, isAdmin],
  );

  const performDelete = useCallback(
    async (vehicle: Vehicle) => {
      if (!isAdmin || !admin?.authUserId) {
        setError("هذه العملية تتطلب صلاحيات مشرف.");
        return;
      }

      setActionKey(`delete:${vehicle.id}`);
      setError(null);
      setSuccess(null);

      const result = await VehiclesService.deleteVehicleForAdmin({
        vehicleId: vehicle.id,
        actorAuthUserId: admin.authUserId,
        actorEmployeeId: admin.id,
      });

      if (result.error) {
        setError(result.error);
        setActionKey(null);
        return;
      }

      const deletedFuelEntries = result.data?.deletedFuelEntriesCount ?? 0;
      setVehicles((prev) => prev.filter((item) => item.id !== vehicle.id));
      setVehicleImageUrls((prev) => {
        if (!prev[vehicle.id]) return prev;
        const next = { ...prev };
        delete next[vehicle.id];
        return next;
      });
      if (editingVehicleId === vehicle.id) {
        cancelEdit();
      }
      if (movingVehicleId === vehicle.id) {
        cancelMove();
      }
      setSuccess(
        deletedFuelEntries > 0
          ? `تم حذف المركبة مع ${deletedFuelEntries} سجل تعبئة وقود.`
          : "تم حذف المركبة بنجاح.",
      );
      setActionKey(null);
    },
    [
      admin?.authUserId,
      admin?.id,
      cancelEdit,
      cancelMove,
      editingVehicleId,
      isAdmin,
      movingVehicleId,
    ],
  );

  const requestDelete = useCallback(
    async (vehicle: Vehicle) => {
      if (!isAdmin || !admin?.authUserId) {
        setError("هذه العملية تتطلب صلاحيات مشرف.");
        return;
      }

      setActionKey(`impact:${vehicle.id}`);
      setError(null);

      const impact = await VehiclesService.getVehicleDeleteImpact(vehicle.id);
      setActionKey(null);

      if (impact.error) {
        setError(impact.error);
        return;
      }

      const linkedFuelEntries = impact.data?.fuelEntriesCount ?? 0;
      const dependencyMessage =
        linkedFuelEntries > 0
          ? `سيتم حذف المركبة مع ${linkedFuelEntries} سجل تعبئة وقود مرتبط تلقائيًا (Cascade).`
          : "لا توجد سجلات وقود مرتبطة بهذه المركبة.";

      runConfirm(
        "تأكيد حذف المركبة",
        `${dependencyMessage}\n\nهل أنت متأكد من متابعة الحذف؟`,
        () => {
          void performDelete(vehicle);
        },
      );
    },
    [admin?.authUserId, isAdmin, performDelete, runConfirm],
  );

  if (!isAdmin) {
    return (
      <View style={styles.centeredScreen}>
        <View style={styles.centeredCard}>
          <MaterialCommunityIcons name="shield-lock-outline" size={28} color={palette.primaryDark} />
          <Text style={styles.centeredTitle}>لا تملك صلاحية الوصول</Text>
          <Text style={styles.centeredSubtitle}>
            هذه الصفحة متاحة للمشرفين فقط (Admin) لإدارة المركبات والفصائل.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>إدارة المركبات والفصائل</Text>
        <Text style={styles.subtitle}>
          من هنا يمكنك إضافة مركبة جديدة، تعديل بياناتها، نقلها بين الفصائل، أو تفعيلها وتعطيلها وحذفها.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>إضافة مركبة جديدة</Text>

        <Text style={styles.inputLabel}>الفصيلة</Text>
        <View style={styles.factionRow}>
          {FACTION_OPTIONS.map((faction) => (
            <Pressable
              key={faction}
              style={({ pressed }) => [
                styles.factionChip,
                selectedFaction === faction && styles.factionChipActive,
                pressed && styles.factionChipPressed,
              ]}
              onPress={() => setSelectedFaction(faction)}
            >
              <Text
                style={[
                  styles.factionChipText,
                  selectedFaction === faction && styles.factionChipTextActive,
                ]}
              >
                {faction}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="اسم المركبة"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />
        <TextInput
          style={styles.input}
          value={plate}
          onChangeText={setPlate}
          placeholder="رقم اللوحة"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          value={vehicleType}
          onChangeText={setVehicleType}
          placeholder="نوع المركبة"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />
        <TextInput
          style={styles.input}
          value={maintenanceDueKm}
          onChangeText={setMaintenanceDueKm}
          placeholder="الصيانة القادمة (كم) - اختياري"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          keyboardType="numeric"
        />

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={() => void pickVehicleImage()}
        >
          <Text style={styles.secondaryButtonText}>
            {vehicleImage ? "تغيير صورة المركبة" : "اختيار صورة المركبة"}
          </Text>
        </Pressable>

        {vehicleImage?.uri ? (
          <Image source={{ uri: vehicleImage.uri }} style={styles.createPreviewImage} contentFit="cover" />
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (!canCreate || isCreating) && styles.buttonDisabled,
            pressed && canCreate && !isCreating && styles.buttonPressed,
          ]}
          onPress={() => void createVehicle()}
          disabled={!canCreate || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>إضافة مركبة</Text>
          )}
        </Pressable>
      </View>

      {editingVehicle ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>تعديل المركبة: {editingVehicle.name}</Text>
          <TextInput
            style={styles.input}
            value={editName}
            onChangeText={setEditName}
            placeholder="اسم المركبة"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
          />
          <TextInput
            style={styles.input}
            value={editPlate}
            onChangeText={setEditPlate}
            placeholder="رقم اللوحة"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.input}
            value={editVehicleType}
            onChangeText={setEditVehicleType}
            placeholder="نوع المركبة"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
          />
          <TextInput
            style={styles.input}
            value={editMaintenanceDueKm}
            onChangeText={setEditMaintenanceDueKm}
            placeholder="الصيانة القادمة (كم) - اختياري"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
            keyboardType="numeric"
          />

          <View style={styles.inlineActionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                styles.inlineButtonMuted,
                pressed && styles.buttonPressed,
              ]}
              onPress={cancelEdit}
            >
              <Text style={styles.inlineButtonMutedText}>إلغاء</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                styles.inlineButtonPrimary,
                (!canSaveEdit || actionKey === `update:${editingVehicle.id}`) && styles.buttonDisabled,
                pressed &&
                  canSaveEdit &&
                  actionKey !== `update:${editingVehicle.id}` &&
                  styles.buttonPressed,
              ]}
              onPress={() => void saveEdit()}
              disabled={!canSaveEdit || actionKey === `update:${editingVehicle.id}`}
            >
              {actionKey === `update:${editingVehicle.id}` ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.inlineButtonPrimaryText}>حفظ التعديل</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {movingVehicle ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>نقل المركبة: {movingVehicle.name}</Text>
          <Text style={styles.subtitle}>الفصيلة الحالية: {movingVehicle.faction}</Text>

          <View style={styles.factionRow}>
            {FACTION_OPTIONS.map((faction) => (
              <Pressable
                key={faction}
                style={({ pressed }) => [
                  styles.factionChip,
                  moveTargetFaction === faction && styles.factionChipActive,
                  pressed && styles.factionChipPressed,
                ]}
                onPress={() => setMoveTargetFaction(faction)}
              >
                <Text
                  style={[
                    styles.factionChipText,
                    moveTargetFaction === faction && styles.factionChipTextActive,
                  ]}
                >
                  {faction}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inlineActionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                styles.inlineButtonMuted,
                pressed && styles.buttonPressed,
              ]}
              onPress={cancelMove}
            >
              <Text style={styles.inlineButtonMutedText}>إلغاء</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                styles.inlineButtonPrimary,
                (!canApplyMove || actionKey === `move:${movingVehicle.id}`) && styles.buttonDisabled,
                pressed &&
                  canApplyMove &&
                  actionKey !== `move:${movingVehicle.id}` &&
                  styles.buttonPressed,
              ]}
              onPress={() =>
                runConfirm(
                  "تأكيد نقل المركبة",
                  `سيتم نقل المركبة من ${movingVehicle.faction} إلى ${moveTargetFaction}.`,
                  () => {
                    void submitMove();
                  },
                )
              }
              disabled={!canApplyMove || actionKey === `move:${movingVehicle.id}`}
            >
              {actionKey === `move:${movingVehicle.id}` ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.inlineButtonPrimaryText}>تنفيذ النقل</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>قائمة المركبات</Text>
          <Pressable
            style={({ pressed }) => [styles.refreshPill, pressed && styles.factionChipPressed]}
            onPress={() => void loadVehicles()}
          >
            <Text style={styles.refreshPillText}>تحديث</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ابحث باسم المركبة أو رقم اللوحة"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <View style={styles.factionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.factionChip,
              listFactionFilter === "all" && styles.factionChipActive,
              pressed && styles.factionChipPressed,
            ]}
            onPress={() => setListFactionFilter("all")}
          >
            <Text
              style={[
                styles.factionChipText,
                listFactionFilter === "all" && styles.factionChipTextActive,
              ]}
            >
              الكل
            </Text>
          </Pressable>

          {FACTION_OPTIONS.map((faction) => (
            <Pressable
              key={faction}
              style={({ pressed }) => [
                styles.factionChip,
                listFactionFilter === faction && styles.factionChipActive,
                pressed && styles.factionChipPressed,
              ]}
              onPress={() => setListFactionFilter(faction)}
            >
              <Text
                style={[
                  styles.factionChipText,
                  listFactionFilter === faction && styles.factionChipTextActive,
                ]}
              >
                {faction}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جارٍ تحميل المركبات...</Text>
          </View>
        ) : null}

        {!isLoading && filteredVehicles.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد مركبات مطابقة للتصفية الحالية.</Text>
        ) : null}
      </View>

      {!isLoading &&
        filteredVehicles.map((vehicle) => {
          const activeBadge = vehicle.isActive ? ACTIVE_BADGE : INACTIVE_BADGE;
          const isToggling = actionKey === `toggle:${vehicle.id}`;
          const isDeleting = actionKey === `delete:${vehicle.id}` || actionKey === `impact:${vehicle.id}`;
          const isEditingAction = actionKey === `update:${vehicle.id}`;
          const isMovingAction = actionKey === `move:${vehicle.id}`;
          const isBusy = isToggling || isDeleting || isEditingAction || isMovingAction;

          return (
            <View key={vehicle.id} style={styles.vehicleCard}>
              {vehicleImageUrls[vehicle.id] ? (
                <Image source={{ uri: vehicleImageUrls[vehicle.id] }} style={styles.vehicleImage} contentFit="cover" />
              ) : (
                <View style={styles.vehicleImageFallback}>
                  <Text style={styles.vehicleImageFallbackText}>{vehicle.name.slice(0, 1)}</Text>
                </View>
              )}

              <View style={styles.vehicleHeader}>
                <Text style={styles.vehicleName}>{vehicle.name}</Text>
                <View style={styles.badgesRow}>
                  <View style={[styles.statusBadge, { backgroundColor: activeBadge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: activeBadge.text }]}>
                      {vehicle.isActive ? "نشطة" : "معطلة"}
                    </Text>
                  </View>
                  <View style={styles.factionBadge}>
                    <Text style={styles.factionBadgeText}>{vehicle.faction}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.metaText}>رقم اللوحة: {vehicle.plateNumber}</Text>
              <Text style={styles.metaText}>النوع: {vehicle.vehicleType}</Text>
              <Text style={styles.metaText}>آخر عداد: {vehicle.lastOdometer}</Text>
              <Text style={styles.metaText}>
                الصيانة عند: {vehicle.maintenanceDueKm === null ? "غير محدد" : `${vehicle.maintenanceDueKm} كم`}
              </Text>

              <View style={styles.actionsGrid}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonSecondary,
                    pressed && !isBusy && styles.buttonPressed,
                    isBusy && styles.buttonDisabled,
                  ]}
                  disabled={isBusy}
                  onPress={() => startEdit(vehicle)}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={palette.primaryDark} />
                  <Text style={styles.actionButtonSecondaryText}>تعديل</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonSecondary,
                    pressed && !isBusy && styles.buttonPressed,
                    isBusy && styles.buttonDisabled,
                  ]}
                  disabled={isBusy}
                  onPress={() => startMove(vehicle)}
                >
                  <MaterialCommunityIcons name="swap-horizontal" size={16} color={palette.primaryDark} />
                  <Text style={styles.actionButtonSecondaryText}>نقل فصيل</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonDark,
                    pressed && !isBusy && styles.buttonPressed,
                    isBusy && styles.buttonDisabled,
                  ]}
                  disabled={isBusy}
                  onPress={() => void toggleActive(vehicle)}
                >
                  {isToggling ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={vehicle.isActive ? "toggle-switch-off-outline" : "toggle-switch-outline"}
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionButtonDarkText}>
                        {vehicle.isActive ? "تعطيل" : "تفعيل"}
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonDanger,
                    pressed && !isBusy && styles.buttonPressed,
                    isBusy && styles.buttonDisabled,
                  ]}
                  disabled={isBusy}
                  onPress={() => void requestDelete(vehicle)}
                >
                  {isDeleting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="delete-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.actionButtonDangerText}>حذف نهائي</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centeredScreen: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  centeredCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: "center",
  },
  centeredTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 20,
    textAlign: "center",
  },
  centeredSubtitle: {
    color: palette.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
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
  vehicleCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 27,
  },
  subtitle: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 20,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  inputLabel: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.text,
  },
  factionRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  factionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  factionChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#E8F1FF",
  },
  factionChipPressed: {
    opacity: 0.8,
  },
  factionChipText: {
    color: palette.text,
    fontWeight: "700",
  },
  factionChipTextActive: {
    color: palette.primaryDark,
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
  createPreviewImage: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  primaryButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  inlineActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  inlineButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 6,
  },
  inlineButtonPrimary: {
    backgroundColor: palette.primary,
  },
  inlineButtonMuted: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.line,
  },
  inlineButtonPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  inlineButtonMutedText: {
    color: palette.text,
    fontWeight: "800",
  },
  listHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  refreshPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: palette.surfaceMuted,
  },
  refreshPillText: {
    color: palette.primaryDark,
    fontWeight: "700",
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
  vehicleImage: {
    width: "100%",
    height: 154,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
    marginBottom: spacing.xs,
  },
  vehicleImageFallback: {
    width: "100%",
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#EAF1FC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  vehicleImageFallbackText: {
    color: palette.primaryDark,
    fontWeight: "900",
    fontSize: 24,
  },
  vehicleHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  vehicleName: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 19,
  },
  badgesRow: {
    flexDirection: "row-reverse",
    gap: 6,
    alignItems: "center",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontWeight: "700",
    fontSize: 12,
  },
  factionBadge: {
    borderRadius: 999,
    backgroundColor: "#E8F1FF",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  factionBadgeText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  metaText: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 19,
  },
  actionsGrid: {
    marginTop: spacing.sm,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionButton: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  actionButtonSecondary: {
    backgroundColor: "#EEF3FB",
    borderWidth: 1,
    borderColor: "#D5E1F6",
  },
  actionButtonSecondaryText: {
    color: palette.primaryDark,
    fontWeight: "800",
    fontSize: 13,
  },
  actionButtonDark: {
    backgroundColor: "#102A4A",
  },
  actionButtonDarkText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  actionButtonDanger: {
    backgroundColor: "#B42318",
  },
  actionButtonDangerText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.56,
  },
});
