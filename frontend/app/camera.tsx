import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useTheme } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";

const CAMERA_VOCAB = [
  "Hello",
  "Thank you",
  "Yes",
  "No",
  "Help",
  "OK",
  "Stop",
  "Slow down",
  "Water",
  "Thumb up",
  "Thumb down",
  "Left",
  "Right",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
];

export default function CameraFallback() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const { setInputMode, contextMode, addToken } = useTranslation();
  const cameraRef = useRef<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastLabel, setLastLabel] = useState("");
  const [lastSpoken, setLastSpoken] = useState("");
  const [lastConfidence, setLastConfidence] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    setInputMode("Camera backup");
  }, [setInputMode]);

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface, padding: 24 }]}>
        <View style={[styles.permissionIcon, { backgroundColor: colors.brandTertiary }]}>
          <Ionicons name="camera-outline" size={30} color={colors.brandPrimary} />
        </View>
        <Text style={[styles.title, { color: colors.onSurface }]}>Camera backup</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Allow camera access so the vision model can watch hand gestures when the glove is unavailable.
        </Text>
        {!permission.canAskAgain ? (
          <Text style={[styles.body, { color: colors.error, fontSize: 13 }]}>
            Camera access was previously denied. Please enable it from your device Settings.
          </Text>
        ) : null}
        <Pressable
          style={[styles.primary, { backgroundColor: colors.brandPrimary }]}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel="Allow camera access"
          testID="camera-permission-button"
        >
          <Text style={[styles.primaryText, { color: colors.onBrandPrimary }]}>Allow camera access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.brandPrimary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    setError("");
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
        skipProcessing: true,
      });
      if (!photo?.base64) throw new Error("Could not capture a camera frame");
      const result = await api.recognizeGesture(photo.base64, contextMode, CAMERA_VOCAB);
      setLastLabel(result.label);
      setLastSpoken(result.spoken_text);
      setLastConfidence(result.confidence);
      if (result.label && result.label !== "none" && result.confidence !== "none") {
        addToken(result.spoken_text || result.label);
      }
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Could not recognize gesture");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.camera}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
      <View style={[styles.scrim, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.topRow}>
          <Pressable
            style={styles.iconButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close camera backup"
            testID="camera-close-button"
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.topPill}>
            <View style={styles.liveDot} />
            <Text style={styles.pillText}>Camera · {contextMode}</Text>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
            accessibilityRole="button"
            accessibilityLabel="Switch camera"
            testID="camera-flip-button"
          >
            <Ionicons name="camera-reverse-outline" size={23} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
          <View style={styles.modelTag}>
            <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
            <Text style={styles.tagText}>
              {busy
                ? "Reading hand sign…"
                : lastLabel && lastLabel !== "none"
                ? `${lastLabel} → ${lastSpoken} · ${lastConfidence}`
                : "Position your hand and tap capture"}
            </Text>
          </View>
        </View>

        <View style={styles.bottomCard}>
          <Text style={styles.bottomTitle}>
            {lastLabel && lastLabel !== "none" ? "Added to your sentence" : "Capture a hand sign"}
          </Text>
          <Text style={styles.bottomText}>
            {error ||
              (lastLabel && lastLabel !== "none"
                ? `"${lastSpoken}" was appended using ${contextMode} context.`
                : "Hold your hand still inside the frame and tap the capture button.")}
          </Text>
          <Pressable
            style={styles.captureBtn}
            onPress={() => void capture()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Capture gesture"
            testID="camera-capture-button"
          >
            {busy ? (
              <ActivityIndicator color="#1C1C1E" />
            ) : (
              <Ionicons name="camera" size={30} color="#1C1C1E" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: "#121212" },
  scrim: { ...StyleSheet.absoluteFill as object, justifyContent: "space-between" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  iconButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center" },
  topPill: { borderRadius: 999, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F2B38B" },
  pillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  frame: { height: "48%", marginHorizontal: 34, position: "relative", justifyContent: "flex-end" },
  corner: { width: 30, height: 30, position: "absolute", borderColor: "#FFFFFF" },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  modelTag: { alignSelf: "center", borderRadius: 999, backgroundColor: "rgba(0,0,0,0.48)", paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "95%" },
  tagText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  bottomCard: { marginHorizontal: 18, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.68)", padding: 18, gap: 10, alignItems: "center" },
  bottomTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", textAlign: "center" },
  bottomText: { color: "#E4E4E4", fontSize: 13, lineHeight: 19, textAlign: "center" },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  permissionIcon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800" },
  body: { maxWidth: 320, textAlign: "center", fontSize: 16, lineHeight: 23 },
  primary: { minHeight: 52, borderRadius: 16, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 16, fontWeight: "800" },
  cancel: { fontSize: 15, fontWeight: "800" },
});
