import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { speakSentence } from "@/src/audio";
import { useTheme, makeStyles } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";
import type { ContextMode, QuickPhrase } from "@/src/types";

const CONTEXTS: { mode: ContextMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: "Everyday", label: "Everyday", icon: "chatbubbles-outline" },
  { mode: "Riding", label: "Riding", icon: "bicycle-outline" },
  { mode: "Scuba", label: "Scuba", icon: "water-outline" },
];

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 18 },
  header: { gap: 6 },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  contextRow: { gap: 8, paddingVertical: 2 },
  contextChip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", gap: 6 },
  contextChipActive: { backgroundColor: colors.brandPrimary },
  contextChipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  contextChipTextActive: { color: colors.onBrandPrimary },
  statusRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  statusPill: { borderRadius: 999, backgroundColor: colors.brandTertiary, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  statusDotDemo: { backgroundColor: colors.warning },
  statusText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  alert: { borderRadius: 14, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  alertText: { color: colors.onSurfaceTertiary, flex: 1, fontSize: 13, lineHeight: 18 },
  sentenceCard: { minHeight: 200, borderRadius: 24, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 22, justifyContent: "space-between", gap: 10 },
  cardLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  sentence: { color: colors.onSurface, fontSize: 28, lineHeight: 36, fontWeight: "700", letterSpacing: -0.4 },
  placeholder: { color: colors.muted, fontSize: 20, lineHeight: 29, fontWeight: "600" },
  ticker: { gap: 8, paddingTop: 2 },
  token: { backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  tokenText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "700" },
  quickRow: { gap: 8, paddingVertical: 2 },
  quick: { flexShrink: 0, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 },
  quickText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  controls: { gap: 12 },
  speak: { minHeight: 58, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  speakText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  secondaryRow: { flexDirection: "row", gap: 12 },
  secondary: { minHeight: 52, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, flex: 1 },
  secondaryText: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  error: { color: colors.error, fontSize: 13, lineHeight: 18, textAlign: "center" },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  historyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  historyBody: { flex: 1 },
  historySentence: { color: colors.onSurface, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  historyMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  historyEmpty: { color: colors.muted, fontSize: 13, fontStyle: "italic" },
  clearHistory: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800" },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));

export default function LiveTranslate() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const {
    tokens,
    sentence,
    inputMode,
    connectionState,
    contextMode,
    setContextMode,
    clearSentence,
    commitSentence,
    history,
    refreshHistory,
    clearHistory,
    demoActive,
    addToken,
  } = useTranslation();
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setPhrases(await api.getQuickPhrases(contextMode));
      } catch {
        // ignore
      }
    })();
  }, [contextMode]);

  useEffect(() => () => setSpeaking(false), []);

  const speak = async () => {
    if (!sentence) return;
    setError("");
    setSpeaking(true);
    try {
      const settings = await api.getSettings();
      await speakSentence(sentence, settings.speech_rate);
      await commitSentence();
      await refreshHistory();
    } catch (speechError) {
      setError(speechError instanceof Error ? speechError.message : "Speech could not start. Try again.");
    } finally {
      setSpeaking(false);
    }
  };

  const speakHistory = async (text: string) => {
    setError("");
    setSpeaking(true);
    try {
      const settings = await api.getSettings();
      await speakSentence(text, settings.speech_rate);
    } catch (speechError) {
      setError(speechError instanceof Error ? speechError.message : "Speech could not start. Try again.");
    } finally {
      setSpeaking(false);
    }
  };

  const statusLabel =
    connectionState === "demo"
      ? "Demo stream · live"
      : connectionState === "connected"
      ? "Connected"
      : "Ready";

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SignWave Connect</Text>
          <Text style={styles.title}>Keep the conversation moving.</Text>
          <Text style={styles.subtitle}>Signs become words, then a voice your listener can hear.</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.contextRow}
        >
          {CONTEXTS.map((ctx) => {
            const active = contextMode === ctx.mode;
            return (
              <Pressable
                key={ctx.mode}
                testID={`context-chip-${ctx.mode.toLowerCase()}`}
                style={[styles.contextChip, active && styles.contextChipActive]}
                onPress={() => void setContextMode(ctx.mode)}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${ctx.label} mode`}
              >
                <Ionicons
                  name={ctx.icon}
                  size={16}
                  color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}
                />
                <Text style={[styles.contextChipText, active && styles.contextChipTextActive]}>{ctx.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, demoActive && styles.statusDotDemo]} />
            <Text style={styles.statusText}>
              {inputMode} · {statusLabel}
            </Text>
          </View>
        </View>

        {connectionState !== "connected" && !demoActive && inputMode === "Bluetooth glove" && (
          <Pressable
            style={styles.alert}
            onPress={() => router.push("/(tabs)/connect")}
            accessibilityRole="button"
            accessibilityLabel="Pair a Bluetooth glove or start demo mode"
            testID="pair-glove-cta"
          >
            <Ionicons name="bluetooth-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.alertText}>
              Pair your glove to receive signals — or try Demo Mode from the Connect tab.
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}

        <View style={styles.sentenceCard} accessibilityLabel="Live translated sentence">
          <Text style={styles.cardLabel}>Live translation</Text>
          <Text style={sentence ? styles.sentence : styles.placeholder} testID="live-sentence">
            {sentence || "Awaiting your first gesture…"}
          </Text>
          <Text style={styles.cardLabel}>
            {tokens.length ? `${tokens.length} signals received` : "Your sentence will appear here"}
          </Text>
        </View>

        {tokens.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticker}>
            {tokens.slice(-8).map((token, index) => (
              <View style={styles.token} key={`${token}-${index}`}>
                <Text style={styles.tokenText}>{token}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {phrases.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Quick phrases</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
              {phrases.map((phrase) => (
                <Pressable
                  key={phrase.id}
                  testID={`quick-phrase-${phrase.id}`}
                  style={styles.quick}
                  onPress={() => addToken(phrase.text)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add quick phrase ${phrase.text}`}
                >
                  <Ionicons name={phrase.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.brandPrimary} />
                  <Text style={styles.quickText}>{phrase.text}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.controls}>
          <Pressable
            style={({ pressed }) => [styles.speak, pressed && { opacity: 0.8 }]}
            onPress={speak}
            disabled={!sentence || speaking}
            accessibilityRole="button"
            accessibilityLabel="Speak translated sentence"
            testID="speak-aloud-button"
          >
            {speaking ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Ionicons name="volume-high-outline" size={22} color={colors.onBrandPrimary} />
            )}
            <Text style={styles.speakText}>{speaking ? "Preparing voice…" : "Speak aloud"}</Text>
          </Pressable>
          <View style={styles.secondaryRow}>
            <Pressable
              style={styles.secondary}
              onPress={clearSentence}
              disabled={!sentence}
              accessibilityRole="button"
              accessibilityLabel="Clear sentence"
              testID="clear-sentence-button"
            >
              <Ionicons name="trash-outline" size={19} color={colors.onSurface} />
              <Text style={styles.secondaryText}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => router.push("/camera")}
              accessibilityRole="button"
              accessibilityLabel="Open camera backup"
              testID="open-camera-button"
            >
              <Ionicons name="camera-outline" size={19} color={colors.onSurface} />
              <Text style={styles.secondaryText}>Camera backup</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Recent sentences</Text>
          {history.length > 0 && (
            <Pressable onPress={() => void clearHistory()} accessibilityRole="button" accessibilityLabel="Clear history">
              <Text style={styles.clearHistory}>Clear</Text>
            </Pressable>
          )}
        </View>
        {history.length === 0 ? (
          <Text style={styles.historyEmpty}>Spoken sentences will be saved here so you can repeat them.</Text>
        ) : (
          history.map((item) => (
            <Pressable
              key={item.id}
              style={styles.historyCard}
              onPress={() => void speakHistory(item.sentence)}
              accessibilityRole="button"
              accessibilityLabel={`Replay sentence ${item.sentence}`}
              testID={`history-item-${item.id}`}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.brandPrimary} />
              <View style={styles.historyBody}>
                <Text style={styles.historySentence} numberOfLines={2}>
                  {item.sentence}
                </Text>
                <Text style={styles.historyMeta}>
                  {item.context_mode} · {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <Ionicons name="volume-medium-outline" size={18} color={colors.muted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
