import { Stack } from "expo-router";

export default function MemberLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="my-weekly-rest" />
      <Stack.Screen name="weapon-verification" />
      <Stack.Screen name="fuel-form" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="support" />
      <Stack.Screen name="faction-chat" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="linked-devices" />
    </Stack>
  );
}
