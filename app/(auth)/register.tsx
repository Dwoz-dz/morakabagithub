import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FACTION_OPTIONS, isSupportedFaction } from "@/src/constants/factions";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing, typography } from "@/src/theme/tokens";
import { validateEmail } from "@/src/utils/validation";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterScreen() {
  const router = useRouter();
  const signUp = useAuthStore((state) => state.signUp);
  const clearError = useAuthStore((state) => state.clearError);
  const storeError = useAuthStore((state) => state.error);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [faction, setFaction] = useState("");
  const [isFactionMenuOpen, setIsFactionMenuOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const combinedError = localError ?? storeError;
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const clearAllErrors = () => {
    if (localError) {
      setLocalError(null);
    }
    if (storeError) {
      clearError();
    }
  };

  const validateForm = (): string | null => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim() || !normalizedEmail || !password || !confirmPassword || !faction.trim()) {
      return "يرجى ملء جميع الحقول المطلوبة.";
    }

    if (fullName.trim().length < 3) {
      return "الاسم الكامل يجب أن يحتوي على 3 أحرف على الأقل.";
    }

    if (!validateEmail(normalizedEmail)) {
      return "يرجى إدخال بريد إلكتروني صحيح.";
    }

    if (!isSupportedFaction(faction)) {
      return "يرجى اختيار الفصيلة من القائمة.";
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
    }

    if (password !== confirmPassword) {
      return "تأكيد كلمة المرور غير مطابق.";
    }

    return null;
  };

  const submit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    const success = await signUp({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      faction: faction.trim(),
    });

    if (success) {
      router.replace("/(auth)/waiting-approval");
    }
  };

  const disabled =
    isSubmitting ||
    !fullName.trim() ||
    !email.trim() ||
    !password ||
    !confirmPassword ||
    !faction.trim();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <View style={styles.heroGlow} />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBlock}>
            <Text style={styles.brand}>Morakaba</Text>
            <Text style={styles.headerTitle}>طلب تسجيل جديد</Text>
            <Text style={styles.subtitle}>
              أي تسجيل جديد يبقى في حالة انتظار حتى موافقة المدير.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>الاسم الكامل</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
                value={fullName}
                onChangeText={(value) => {
                  clearAllErrors();
                  setFullName(value);
                }}
                placeholder="أدخل الاسم الكامل"
                placeholderTextColor={palette.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>البريد الإلكتروني</Text>
              <TextInput
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                value={email}
                onChangeText={(value) => {
                  clearAllErrors();
                  setEmail(value);
                }}
                placeholder="name@example.com"
                placeholderTextColor={palette.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>الفصيلة</Text>
              <Pressable
                style={({ pressed }) => [styles.factionSelector, pressed && styles.factionSelectorPressed]}
                onPress={() => setIsFactionMenuOpen((prev) => !prev)}
              >
                <Text style={faction ? styles.factionSelectedText : styles.factionPlaceholderText}>
                  {faction || "اختر الفصيلة"}
                </Text>
              </Pressable>

              {isFactionMenuOpen ? (
                <View style={styles.factionList}>
                  {FACTION_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      style={({ pressed }) => [
                        styles.factionOption,
                        faction === option && styles.factionOptionActive,
                        pressed && styles.factionOptionPressed,
                      ]}
                      onPress={() => {
                        clearAllErrors();
                        setFaction(option);
                        setIsFactionMenuOpen(false);
                      }}
                    >
                      <Text style={[styles.factionOptionText, faction === option && styles.factionOptionTextActive]}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>كلمة المرور</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={password}
                  onChangeText={(value) => {
                    clearAllErrors();
                    setPassword(value);
                  }}
                  placeholder="8 أحرف على الأقل"
                  placeholderTextColor={palette.textMuted}
                />

                <Pressable
                  style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
                  onPress={() => setShowPassword((prev) => !prev)}
                >
                  <Text style={styles.toggleButtonText}>{showPassword ? "إخفاء" : "إظهار"}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>تأكيد كلمة المرور</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={confirmPassword}
                  onChangeText={(value) => {
                    clearAllErrors();
                    setConfirmPassword(value);
                  }}
                  placeholder="أعد إدخال كلمة المرور"
                  placeholderTextColor={palette.textMuted}
                />

                <Pressable
                  style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                >
                  <Text style={styles.toggleButtonText}>
                    {showConfirmPassword ? "إخفاء" : "إظهار"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.hintsContainer}>
              <Text style={[styles.hintText, passwordLongEnough ? styles.hintOk : styles.hintNeutral]}>
                {passwordLongEnough ? "✓" : "•"} كلمة المرور 8 أحرف على الأقل
              </Text>
              <Text style={[styles.hintText, passwordsMatch ? styles.hintOk : styles.hintNeutral]}>
                {passwordsMatch ? "✓" : "•"} تأكيد كلمة المرور مطابق
              </Text>
            </View>

            {combinedError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{combinedError}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                disabled && styles.primaryButtonDisabled,
                pressed && !disabled && styles.primaryButtonPressed,
              ]}
              onPress={submit}
              disabled={disabled}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>إرسال طلب التسجيل</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.secondaryButtonText}>العودة لتسجيل الدخول</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  heroGlow: {
    position: "absolute",
    top: -150,
    right: -110,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "#D7E6FA",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.sm,
  },
  brand: {
    textAlign: "center",
    color: palette.primaryDark,
    fontSize: 30,
    fontWeight: "900",
  },
  headerTitle: {
    textAlign: "right",
    color: palette.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 21,
    fontSize: typography.body,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.xl,
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: palette.text,
    textAlign: "right",
    fontWeight: "700",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: "right",
    color: palette.text,
    fontSize: typography.body,
  },
  factionSelector: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  factionSelectorPressed: {
    opacity: 0.9,
  },
  factionPlaceholderText: {
    color: palette.textMuted,
    textAlign: "right",
    fontSize: typography.body,
  },
  factionSelectedText: {
    color: palette.text,
    textAlign: "right",
    fontSize: typography.body,
    fontWeight: "700",
  },
  factionList: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  factionOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  factionOptionActive: {
    backgroundColor: "#E7F0FD",
  },
  factionOptionPressed: {
    opacity: 0.8,
  },
  factionOptionText: {
    textAlign: "right",
    color: palette.text,
    fontSize: typography.body,
  },
  factionOptionTextActive: {
    color: palette.primaryDark,
    fontWeight: "800",
  },
  passwordRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  passwordInput: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    fontSize: typography.body,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  toggleButton: {
    borderRadius: 999,
    backgroundColor: "#E2EAF7",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  toggleButtonPressed: {
    opacity: 0.8,
  },
  toggleButtonText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  hintsContainer: {
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  hintText: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
  },
  hintNeutral: {
    color: palette.textMuted,
  },
  hintOk: {
    color: palette.accent,
  },
  errorBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F1C6C6",
    backgroundColor: "#FFF2F2",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    color: palette.danger,
    textAlign: "right",
    fontWeight: "600",
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  primaryButtonDisabled: {
    backgroundColor: "#A8B8D0",
  },
  primaryButtonPressed: {
    backgroundColor: palette.primaryDark,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  secondaryButtonPressed: {
    opacity: 0.75,
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
});