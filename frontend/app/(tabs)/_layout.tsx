import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf="waveform.path.ecg" /><NativeTabs.Trigger.Label>Translate</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="connect"><NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" /><NativeTabs.Trigger.Label>Connect</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="signs"><NativeTabs.Trigger.Icon sf="hand.raised.fill" /><NativeTabs.Trigger.Label>Signs</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings"><NativeTabs.Trigger.Icon sf="gearshape.fill" /><NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandPrimary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { ...(Platform.OS === "web" ? { height: 64 } : {}) },
      tabBarItemStyle: { alignSelf: "center" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Translate", tabBarIcon: ({ color, size }) => <Ionicons name="language-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="connect" options={{ title: "Connect", tabBarIcon: ({ color, size }) => <Ionicons name="bluetooth-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="signs" options={{ title: "Signs", tabBarIcon: ({ color, size }) => <Ionicons name="hand-left-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}