import { Platform, Text, TextInput, type TextStyle } from "react-native";

import { fontFamily } from "./typography";

const rtlTextStyle: TextStyle = {
  fontFamily: fontFamily.arabicPrimary,
  textAlign: "right",
  writingDirection: "rtl",
};

type DefaultableTextComponent = {
  defaultProps?: {
    style?: unknown;
    [key: string]: unknown;
  };
};

function applyRtlDefaults(component: DefaultableTextComponent) {
  const defaultProps = component.defaultProps ?? {};

  component.defaultProps = {
    ...defaultProps,
    style: [rtlTextStyle, defaultProps.style],
  };
}

export function configureArabicTextDefaults() {
  const globalState = globalThis as typeof globalThis & {
    __morakabaArabicTextDefaultsConfigured?: boolean;
  };

  if (globalState.__morakabaArabicTextDefaultsConfigured) {
    return;
  }

  globalState.__morakabaArabicTextDefaultsConfigured = true;

  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
  }

  applyRtlDefaults(Text as unknown as DefaultableTextComponent);
  applyRtlDefaults(TextInput as unknown as DefaultableTextComponent);
}
