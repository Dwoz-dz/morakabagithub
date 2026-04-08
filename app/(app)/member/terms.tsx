import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppSettingsService } from "@/src/services/supabase/app-settings.service";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/formatting";

const DEFAULT_TERMS: string[] = [
  "يهدف تطبيق Morakaba إلى إدارة المتابعة اليومية للموظفين والمركبات والمهام التشغيلية داخل الفصائل المعتمدة فقط.",
  "يُسمح لكل موظف بالوصول إلى بياناته الشخصية والوظيفية المرتبطة بحسابه فقط، ويُمنع الوصول إلى بيانات موظفين آخرين.",
  "أي إدخال في وحدات الوقود أو السلاح يجب أن يكون صحيحًا ومطابقًا للواقع، ويتحمل المستخدم مسؤولية صحة المعلومات المرسلة.",
  "تحتفظ الإدارة بحق مراجعة واعتماد أو رفض أي إرسال تشغيلي عند وجود نقص أو تضارب في البيانات.",
  "يُستخدم النظام لأغراض تشغيلية وأمنية داخلية فقط، ويمنع نسخ أو مشاركة البيانات خارج نطاق العمل المصرح به.",
  "قد يتم تحديث هذه الشروط دوريًا، ويعد استمرار استخدام التطبيق موافقة صريحة على النسخة الأحدث المعتمدة.",
];

export default function MemberTermsScreen() {
  const [termsVersion, setTermsVersion] = useState("1.0");
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [termsLines, setTermsLines] = useState<string[]>(DEFAULT_TERMS);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayDate = useMemo(() => {
    if (!lastUpdated) {
      return "غير محدد";
    }
    return formatDate(new Date(lastUpdated));
  }, [lastUpdated]);

  const loadTerms = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await AppSettingsService.listSettings();
    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    const settings = result.data ?? [];
    const appMeta = settings.find((item) => item.key === "app_meta")?.value ?? {};
    const termsContent = settings.find((item) => item.key === "terms_content")?.value ?? {};

    const customLines = termsContent.lines as string[] | undefined;
    const customText = termsContent.text as string | undefined;

    if (Array.isArray(customLines) && customLines.length > 0) {
      setTermsLines(customLines.map((line) => String(line)));
    } else if (typeof customText === "string" && customText.trim().length > 0) {
      setTermsLines(
        customText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
    } else {
      setTermsLines(DEFAULT_TERMS);
    }

    setTermsVersion((appMeta.termsVersion as string | undefined) ?? "1.0");
    setSupportPhone((appMeta.supportPhone as string | undefined) ?? null);
    setSupportEmail((appMeta.supportEmail as string | undefined) ?? null);

    const updatedAt = (termsContent.updatedAt as string | undefined) ?? appMeta.updatedAt ?? null;
    setLastUpdated(updatedAt as string | null);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTerms();
    }, [loadTerms]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCard}>
        <Text style={styles.title}>الشروط والأحكام</Text>
        <Text style={styles.subtitle}>
          يرجى قراءة البنود التالية بعناية لضمان استخدام التطبيق بشكل آمن ومنضبط.
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaValue}>{displayDate}</Text>
          <Text style={styles.metaLabel}>آخر تحديث</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaValue}>{termsVersion}</Text>
          <Text style={styles.metaLabel}>نسخة الشروط</Text>
        </View>
      </View>

      <View style={styles.card}>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الشروط...</Text>
          </View>
        ) : null}

        {error ? (
          <Text style={styles.errorText}>
            تعذر جلب أحدث نسخة من الشروط، تم عرض النسخة الافتراضية. ({error})
          </Text>
        ) : null}

        {!isLoading
          ? termsLines.map((line, index) => (
              <View key={`${index}-${line.slice(0, 12)}`} style={styles.termRow}>
                <Text style={styles.termIndex}>{index + 1}</Text>
                <Text style={styles.termText}>{line}</Text>
              </View>
            ))
          : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>معلومات الدعم</Text>
        <Text style={styles.contactText}>الهاتف: {supportPhone ?? "--"}</Text>
        <Text style={styles.contactText}>البريد: {supportEmail ?? "--"}</Text>
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
  heroCard: {
    backgroundColor: "#123D66",
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  title: {
    textAlign: "right",
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 27,
  },
  subtitle: {
    textAlign: "right",
    color: "rgba(255,255,255,0.9)",
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.24)",
    paddingTop: spacing.sm,
  },
  metaLabel: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "700",
  },
  metaValue: {
    color: "#FFFFFF",
    fontWeight: "800",
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
  errorText: {
    textAlign: "right",
    color: "#8E3A00",
    backgroundColor: "#FFF1E6",
    borderWidth: 1,
    borderColor: "#FFD2B3",
    borderRadius: radius.md,
    padding: spacing.sm,
    lineHeight: 20,
    fontWeight: "600",
  },
  termRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingBottom: spacing.sm,
  },
  termIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E8F1FF",
    color: palette.primaryDark,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "800",
    marginTop: 1,
  },
  termText: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    lineHeight: 22,
    fontWeight: "600",
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  contactText: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "600",
  },
});

