import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="registration-requests" />
      <Stack.Screen name="weekly-rest" />
      <Stack.Screen name="employees" />
      <Stack.Screen name="notifications-messages" />
      <Stack.Screen name="broadcast-center" />
      <Stack.Screen name="weapon-submissions" />
      <Stack.Screen name="fuel-submissions" />
      <Stack.Screen name="faction-chat" />
      <Stack.Screen name="vehicles-factions" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="reminders" />
      <Stack.Screen name="activity-logs" />
    </Stack>
  );
}
