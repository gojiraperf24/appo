import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bluetooth } from "@/src/bluetooth";
import type { BluetoothDevice } from "@/src/types";
import { useTheme, makeStyles } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 16 },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  hero: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18, gap: 10 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  heroText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  scan: { minHeight: 54, backgroundColor: colors.brandPrimary, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  scanText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "800" },
  demoCard: { backgroundColor: colors.brandTertiary, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.brandPrimary },
  demoTitle: { color: colors.onBrandTertiary, fontSize: 16, fontWeight: "800" },
  demoText: { color: colors.onBrandTertiary, fontSize: 13, lineHeight: 19 },
  demoBtn: { minHeight: 50, borderRadius: 15, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  demoBtnStop: { backgroundColor: colors.warning },
  demoBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  empty: { alignItems: "center", paddingVertical: 25, gap: 10 },
  emptyText: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  emptySubtext: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  device: { backgroundColor: colors.surfaceSecondary, borderRadius: 17, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  deviceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  deviceInfo: { flex: 1, gap: 4 },
  deviceName: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  deviceMeta: { color: colors.muted, fontSize: 12 },
  connect: { minHeight: 42, borderRadius: 12, backgroundColor: colors.brandTertiary, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  connectText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
}));

export default function ConnectScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { setConnectionState, addToken, demoActive, startDemoMode, stopDemoMode } = useTranslation();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [connectedId, setConnectedId] = useState("");
  const unsubscribe = useRef<(() => void) | null>(null);

  const scan = async () => {
    setError("");
    setDevices([]);
    setScanning(true);
    setConnectionState("scanning");
    try {
      setDevices(await bluetooth.scan());
      setConnectionState("ready");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Could not scan for gloves.");
      setConnectionState("error");
    } finally {
      setScanning(false);
    }
  };

  const connect = async (device: BluetoothDevice) => {
    setError("");
    try {
      await bluetooth.connect(device.id);
      unsubscribe.current?.();
      unsubscribe.current = bluetooth.subscribe(addToken);
      setConnectedId(device.id);
      setConnectionState("connected");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Pairing failed. Check the glove battery and try again.");
      setConnectionState("error");
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28, paddingHorizontal: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Hardware pair</Text>
        <Text style={styles.title}>Connect your glove.</Text>
        <Text style={styles.subtitle}>
          Keep the glove powered on and nearby. If hardware isn&apos;t available, Demo Mode streams realistic
          signals so you can try the full flow.
        </Text>

        <View style={styles.demoCard}>
          <Text style={styles.demoTitle}>Demo Mode</Text>
          <Text style={styles.demoText}>
            Simulates gesture signals every ~2 seconds. Great for trying sentence building and speech without the physical glove.
          </Text>
          <Pressable
            style={[styles.demoBtn, demoActive && styles.demoBtnStop]}
            onPress={() => (demoActive ? stopDemoMode() : startDemoMode())}
            accessibilityRole="button"
            accessibilityLabel={demoActive ? "Stop demo mode" : "Start demo mode"}
            testID="demo-mode-button"
          >
            <Ionicons
              name={demoActive ? "pause-circle-outline" : "play-circle-outline"}
              size={20}
              color={colors.onBrandPrimary}
            />
            <Text style={styles.demoBtnText}>{demoActive ? "Stop Demo Mode" : "Start Demo Mode"}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="bluetooth" size={24} color={colors.brandPrimary} />
          </View>
          <Text style={styles.heroTitle}>Bluetooth gesture input</Text>
          <Text style={styles.heroText}>
            This app listens for the glove&apos;s translated word stream over BLE. Camera backup stays available whenever you need it.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.scan, pressed && { opacity: 0.82 }]}
          onPress={scan}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel="Scan for nearby gloves"
          testID="scan-glove-button"
        >
          {scanning ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Ionicons name="search-outline" size={21} color={colors.onBrandPrimary} />
          )}
          <Text style={styles.scanText}>{scanning ? "Scanning nearby…" : "Scan for nearby gloves"}</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Nearby devices</Text>
        {devices.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="radio-outline" size={30} color={colors.muted} />
            <Text style={styles.emptyText}>{scanning ? "Looking for a glove" : "No glove connected yet"}</Text>
            <Text style={styles.emptySubtext}>
              {bluetooth.isSupported
                ? "Tap scan when your glove is powered on."
                : "Pairing is available from a mobile device, not this web preview."}
            </Text>
          </View>
        ) : (
          devices.map((device) => (
            <View style={styles.device} key={device.id}>
              <View style={styles.deviceIcon}>
                <Ionicons name="hardware-chip-outline" size={21} color={colors.brandPrimary} />
              </View>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceMeta}>{device.rssi ? `Signal ${device.rssi} dBm` : "BLE device"}</Text>
              </View>
              <Pressable
                style={styles.connect}
                onPress={() => connect(device)}
                disabled={connectedId === device.id}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${device.name}`}
              >
                <Text style={styles.connectText}>{connectedId === device.id ? "Connected" : "Connect"}</Text>
              </Pressable>
            </View>
          ))
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.note}>
          Tip: the first hardware prototype may need a BLE UART service configured before it can stream words to the app.
        </Text>
      </ScrollView>
    </View>
  );
}
