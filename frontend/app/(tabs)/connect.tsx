import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bluetooth } from "@/src/bluetooth";
import type { BluetoothDevice } from "@/src/types";
import { useTheme, makeStyles } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 18, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800", flex: 1 },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  cardTextSuccess: { color: colors.success, fontSize: 13, fontWeight: "700" },
  cardTextError: { color: colors.error, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.onSurface, fontSize: 15 },
  rowBtns: { flexDirection: "row", gap: 10 },
  primaryBtn: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  secondaryBtn: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryBtnText: { color: colors.onSurfaceTertiary, fontSize: 15, fontWeight: "800" },
  dangerBtn: { backgroundColor: colors.warning },
  demoBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.brandPrimary },
  demoBadgeText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  empty: { alignItems: "center", paddingVertical: 20, gap: 10 },
  emptyText: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  emptySubtext: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  device: { backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  deviceMeta: { color: colors.muted, fontSize: 12 },
  connect: { minHeight: 40, borderRadius: 11, backgroundColor: colors.brandTertiary, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  connectText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
}));

export default function ConnectScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const {
    setConnectionState,
    addToken,
    demoActive,
    startDemoMode,
    stopDemoMode,
    wifiActive,
    wifiUrl,
    connectWifi,
    disconnectWifi,
    setWifiUrl,
  } = useTranslation();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [bleError, setBleError] = useState("");
  const [connectedId, setConnectedId] = useState("");
  const [wifiInput, setWifiInput] = useState(wifiUrl || "");
  const [wifiBusy, setWifiBusy] = useState(false);
  const [wifiError, setWifiError] = useState("");
  const unsubscribe = useRef<(() => void) | null>(null);

  // Sync local input state once the persisted Wi-Fi URL has been hydrated from
  // AsyncStorage (initial useState captures the empty default before the
  // context's boot effect loads it).
  useEffect(() => {
    if (wifiUrl && !wifiInput) setWifiInput(wifiUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wifiUrl]);

  const scan = async () => {
    setBleError("");
    setDevices([]);
    setScanning(true);
    setConnectionState("scanning");
    try {
      setDevices(await bluetooth.scan());
      setConnectionState("ready");
    } catch (scanError) {
      setBleError(scanError instanceof Error ? scanError.message : "Could not scan for gloves.");
      setConnectionState("error");
    } finally {
      setScanning(false);
    }
  };

  const connect = async (device: BluetoothDevice) => {
    setBleError("");
    try {
      await bluetooth.connect(device.id);
      unsubscribe.current?.();
      unsubscribe.current = bluetooth.subscribe(addToken);
      setConnectedId(device.id);
      setConnectionState("connected");
    } catch (connectError) {
      setBleError(connectError instanceof Error ? connectError.message : "Pairing failed. Try again.");
      setConnectionState("error");
    }
  };

  const onWifiConnect = async () => {
    Keyboard.dismiss();
    setWifiError("");
    setWifiBusy(true);
    try {
      await connectWifi(wifiInput);
    } catch (error) {
      setWifiError(error instanceof Error ? error.message : "Could not connect over Wi-Fi.");
    } finally {
      setWifiBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28, paddingHorizontal: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>Hardware pair</Text>
        <Text style={styles.title}>Connect your glove.</Text>
        <Text style={styles.subtitle}>
          Link your ESP32 glove over Bluetooth or Wi-Fi. If hardware isn&apos;t ready, Demo Mode and the camera let you try the full flow.
        </Text>

        {/* Wi-Fi (ESP32) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="wifi" size={22} color={colors.brandPrimary} />
            </View>
            <Text style={styles.cardTitle}>Wi-Fi (ESP32)</Text>
            {wifiActive ? (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>LIVE</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardText}>
            Enter the ESP32 Wroom WebSocket URL — IP, host:port, or ws://host:port. Default port is 81.
          </Text>
          <TextInput
            testID="wifi-url-input"
            value={wifiInput}
            onChangeText={(text) => {
              setWifiInput(text);
              void setWifiUrl(text);
            }}
            placeholder="192.168.1.50 or ws://192.168.1.50:81"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === "ios" ? "url" : "default"}
            editable={!wifiActive}
            accessibilityLabel="ESP32 Wi-Fi address"
          />
          <View style={styles.rowBtns}>
            {wifiActive ? (
              <Pressable
                testID="wifi-disconnect-button"
                style={[styles.primaryBtn, styles.dangerBtn]}
                onPress={disconnectWifi}
                accessibilityRole="button"
                accessibilityLabel="Disconnect Wi-Fi"
              >
                <Ionicons name="cloud-offline-outline" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.primaryBtnText}>Disconnect</Text>
              </Pressable>
            ) : (
              <Pressable
                testID="wifi-connect-button"
                style={styles.primaryBtn}
                onPress={() => void onWifiConnect()}
                disabled={wifiBusy || !wifiInput.trim()}
                accessibilityRole="button"
                accessibilityLabel="Connect over Wi-Fi"
              >
                {wifiBusy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="wifi-outline" size={18} color={colors.onBrandPrimary} />}
                <Text style={styles.primaryBtnText}>{wifiBusy ? "Connecting…" : "Connect over Wi-Fi"}</Text>
              </Pressable>
            )}
          </View>
          {wifiActive ? (
            <Text style={styles.cardTextSuccess}>Streaming gestures from {wifiUrl}</Text>
          ) : wifiError ? (
            <Text style={styles.cardTextError}>{wifiError}</Text>
          ) : null}
        </View>

        {/* Demo Mode */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="play-circle-outline" size={22} color={colors.brandPrimary} />
            </View>
            <Text style={styles.cardTitle}>Demo Mode</Text>
            {demoActive ? (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>LIVE</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardText}>
            No glove? Simulate gesture signals every ~2 seconds, or use the camera to recognise your actual hand signs without the ESP32.
          </Text>
          <View style={styles.rowBtns}>
            <Pressable
              testID="demo-mode-button"
              style={[styles.primaryBtn, demoActive && styles.dangerBtn]}
              onPress={() => (demoActive ? stopDemoMode() : startDemoMode())}
              accessibilityRole="button"
              accessibilityLabel={demoActive ? "Stop simulator demo" : "Start simulator demo"}
            >
              <Ionicons
                name={demoActive ? "pause-circle-outline" : "play-circle-outline"}
                size={18}
                color={colors.onBrandPrimary}
              />
              <Text style={styles.primaryBtnText}>{demoActive ? "Stop simulator" : "Simulator"}</Text>
            </Pressable>
            <Pressable
              testID="demo-camera-button"
              style={styles.secondaryBtn}
              onPress={() => router.push("/camera?mode=demo")}
              accessibilityRole="button"
              accessibilityLabel="Use camera to recognise gestures"
            >
              <Ionicons name="camera-outline" size={18} color={colors.onSurfaceTertiary} />
              <Text style={styles.secondaryBtnText}>Camera demo</Text>
            </Pressable>
          </View>
        </View>

        {/* Bluetooth */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="bluetooth" size={22} color={colors.brandPrimary} />
            </View>
            <Text style={styles.cardTitle}>Bluetooth</Text>
            {connectedId ? (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>PAIRED</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardText}>
            Listens for the glove&apos;s translated word stream over BLE (Nordic UART service by default).
          </Text>
          <Pressable
            testID="scan-glove-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.82 }]}
            onPress={scan}
            disabled={scanning}
            accessibilityRole="button"
            accessibilityLabel="Scan for nearby gloves"
          >
            {scanning ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Ionicons name="search-outline" size={18} color={colors.onBrandPrimary} />
            )}
            <Text style={styles.primaryBtnText}>{scanning ? "Scanning…" : "Scan for gloves"}</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>Nearby devices</Text>
          {devices.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="radio-outline" size={28} color={colors.muted} />
              <Text style={styles.emptyText}>{scanning ? "Looking for a glove…" : "No glove connected yet"}</Text>
              <Text style={styles.emptySubtext}>
                {bluetooth.isSupported
                  ? "Tap scan when your glove is powered on."
                  : "Pairing is available from a mobile device, not this web preview."}
              </Text>
            </View>
          ) : (
            devices.map((device) => (
              <View style={styles.device} key={device.id}>
                <Ionicons name="hardware-chip-outline" size={21} color={colors.brandPrimary} />
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
          {bleError ? <Text style={styles.error}>{bleError}</Text> : null}
          <Text style={styles.note}>
            The ESP32 prototype must advertise a BLE UART service for the app to stream words over Bluetooth.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
