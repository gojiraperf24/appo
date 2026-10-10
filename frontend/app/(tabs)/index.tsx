import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { speakSentence } from "@/src/audio";
import { useTheme, makeStyles } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 20 },
  header: { gap: 6 },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  status: { borderRadius: 999, backgroundColor: colors.brandTertiary, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
  statusText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "700" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  alert: { borderRadius: 14, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  alertText: { color: colors.onSurfaceTertiary, flex: 1, fontSize: 13, lineHeight: 18 },
  sentenceCard: { minHeight: 220, borderRadius: 24, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 22, justifyContent: "space-between" },
  cardLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  sentence: { color: colors.onSurface, fontSize: 30, lineHeight: 38, fontWeight: "700", letterSpacing: -0.4 },
  placeholder: { color: colors.muted, fontSize: 20, lineHeight: 29, fontWeight: "600" },
  ticker: { gap: 8, paddingTop: 2 },
  token: { backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  tokenText: { color: colors.onBrandTertiary, fontSize: 14, fontWeight: "700" },
  controls: { gap: 12 },
  speak: { minHeight: 58, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  speakText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  secondaryRow: { flexDirection: "row", gap: 12 },
  secondary: { minHeight: 52, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, flex: 1 },
  secondaryText: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  error: { color: colors.error, fontSize: 13, lineHeight: 18, textAlign: "center" },
}));

export default function LiveTranslate() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { tokens, sentence, inputMode, connectionState, clearSentence } = useTranslation();
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { setSpeaking(false); }, []);

  const speak = async () => {
    if (!sentence) return;
    setError("");
    setSpeaking(true);
    try {
      const settings = await api.getSettings();
      await speakSentence(sentence, settings.speech_rate);
    } catch (speechError) {
      setError(speechError instanceof Error ? speechError.message : "Speech could not start. Try again.");
    } finally {
      setSpeaking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SignWave Connect</Text>
          <Text style={styles.title}>Keep the conversation moving.</Text>
          <Text style={styles.subtitle}>Your signs become clear words on screen, then a voice your listener can hear.</Text>
        </View>
        <View style={styles.status} accessibilityLabel={`${inputMode} status`}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{inputMode} · {connectionState === "connected" ? "Connected" : "Ready"}</Text>
        </View>
        {connectionState !== "connected" && inputMode === "Bluetooth glove" && (
          <Pressable style={styles.alert} onPress={() => router.push("/(tabs)/connect")} accessibilityRole="button" accessibilityLabel="Pair a Bluetooth glove">
            <Ionicons name="bluetooth-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.alertText}>Pair your glove to start receiving gesture signals.</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
        <View style={styles.sentenceCard} accessibilityLabel="Live translated sentence">
          <Text style={styles.cardLabel}>Live translation</Text>
          <Text style={sentence ? styles.sentence : styles.placeholder}>{sentence || "Awaiting your first gesture…"}</Text>
          <Text style={styles.cardLabel}>{tokens.length ? `${tokens.length} signals received` : "Your sentence will appear here"}</Text>
        </View>
        {tokens.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticker}>{tokens.slice(-8).map((token, index) => <View style={styles.token} key={`${token}-${index}`}><Text style={styles.tokenText}>{token}</Text></View>)}</ScrollView>}
        <View style={styles.controls}>
          <Pressable style={({ pressed }) => [styles.speak, pressed && { opacity: 0.8 }]} onPress={speak} disabled={!sentence || speaking} accessibilityRole="button" accessibilityLabel="Speak translated sentence">
            {speaking ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="volume-high-outline" size={22} color={colors.onBrandPrimary} />}
            <Text style={styles.speakText}>{speaking ? "Preparing voice…" : "Speak aloud"}</Text>
          </Pressable>
          <View style={styles.secondaryRow}>
            <Pressable style={styles.secondary} onPress={clearSentence} disabled={!sentence} accessibilityRole="button" accessibilityLabel="Clear sentence"><Ionicons name="trash-outline" size={19} color={colors.onSurface} /><Text style={styles.secondaryText}>Clear</Text></Pressable>
            <Pressable style={styles.secondary} onPress={() => router.push("/camera")} accessibilityRole="button" accessibilityLabel="Open camera backup"><Ionicons name="camera-outline" size={19} color={colors.onSurface} /><Text style={styles.secondaryText}>Camera backup</Text></Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}