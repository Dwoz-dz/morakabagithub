import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import FactionChatRealtimeBridge from "@/src/components/chat/faction-chat-realtime-bridge";
import PresenceLifecycle from "@/src/components/presence/presence-lifecycle";
import SmartUpdateGate from "@/src/components/updates/smart-update-gate";

export default function AppLayout() {
  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="admin" />
        <Stack.Screen name="member" />
      </Stack>
      <FactionChatRealtimeBridge />
      <PresenceLifecycle />
      <SmartUpdateGate />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
