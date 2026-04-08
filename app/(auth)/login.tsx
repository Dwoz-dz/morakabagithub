import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing, typography } from "@/src/theme/tokens";
import { validateEmail } from "@/src/utils/validation";

export default function LoginScreen() {
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const clearError = useAuthStore((state) => state.clearError);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const storeError = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const combinedError = localError ?? storeError;

  const clearAllErrors = () => {
    if (localError) {
      setLocalError(null);
    }
    if (storeError) {
      clearError();
    }
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      setLocalError("يرجى إدخال البريد الإلكتروني وكلمة المرور.");
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setLocalError("يرجى إدخال بريد إلكتروني صحيح.");
      return;
    }

    setLocalError(null);
    await signIn(normalizedEmail, password);
  };

  const disabled = isSubmitting || !email.trim() || !password.trim();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.heroBackground} />
      <View style={styles.container}>
        <Text style={styles.brand}>Morakaba</Text>
        <Text style={styles.tagline}>فرقة البحث و الوقاية</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>تسجيل الدخول</Text>
          <Text style={styles.cardSubtitle}>
            الدخول مخصص لموظفي وإدارة فرقة البحث والوقاية.
          </Text>

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
            placeholder="البريد الإلكتروني"
            placeholderTextColor={palette.textMuted}
          />

          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={(value) => {
                clearAllErrors();
                setPassword(value);
              }}
              placeholder="كلمة المرور"
              placeholderTextColor={palette.textMuted}
            />

            <Pressable
              style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
              onPress={() => setShowPassword((prev) => !prev)}
            >
              <Text style={styles.toggleButtonText}>{showPassword ? "إخفاء" : "إظهار"}</Text>
            </Pressable>
          </View>

          {combinedError ? <Text style={styles.errorText}>{combinedError}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              disabled && styles.buttonDisabled,
              pressed && !disabled && styles.buttonPressed,
            ]}
            disabled={disabled}
            onPress={submit}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>دخول</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.linkButtonText}>إنشاء طلب تسجيل جديد</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  heroBackground: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#CFE0F7",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  brand: {
    textAlign: "center",
    color: palette.text,
    fontSize: 34,
    fontWeight: "900",
  },
  tagline: {
    textAlign: "center",
    color: palette.textMuted,
    marginTop: -spacing.sm,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.line,
    gap: spacing.md,
  },
  cardTitle: {
    textAlign: "right",
    color: palette.text,
    fontSize: 24,
    fontWeight: "800",
  },
  cardSubtitle: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    textAlign: "right",
    color: palette.text,
    fontSize: typography.body,
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
  errorText: {
    color: palette.danger,
    textAlign: "right",
    fontWeight: "600",
    lineHeight: 20,
  },
  button: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: "#A8B8D0",
  },
  buttonPressed: {
    backgroundColor: palette.primaryDark,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  linkButtonPressed: {
    opacity: 0.7,
  },
  linkButtonText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 14,
  },
});
