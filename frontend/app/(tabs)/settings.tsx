import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import type { AppSettings } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";

const fallback: AppSettings = { auto_speak: true, speech_rate: 0.92, haptics_enabled: true };

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 17 },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  section: { gap: 9 },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  panel: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { minHeight: 62, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  rowCaption: { color: colors.muted, fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 62 },
  toggle: { width: 50, height: 30, borderRadius: 999, backgroundColor: colors.surfaceTertiary, padding: 3, justifyContent: "center" },
  toggleOn: { backgroundColor: colors.brandPrimary },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceSecondary },
  knobOn: { alignSelf: "flex-end" },
  rates: { flexDirection: "row", gap: 8, padding: 14 },
  rate: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rateActive: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary },
  rateText: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" },
  rateTextActive: { color: colors.onBrandTertiary },
  add: { minHeight: 52, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  addText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  status: { color: colors.success, fontSize: 13, textAlign: "center" },
  modal: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20, gap: 14 },
  modalTitle: { color: colors.onSurface, fontSize: 25, fontWeight: "800" },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, color: colors.onSurface, fontSize: 15 },
  imagePickerRow: { flexDirection: "row", gap: 10 },
  pickerBtn: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pickerBtnText: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: "800" },
  previewWrap: { height: 180, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, position: "relative" },
  preview: { width: "100%", height: "100%" },
  previewClear: { position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  previewHint: { color: colors.muted, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancel: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.onSurface, fontWeight: "800" },
  save: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800" },
  error: { color: colors.error, fontSize: 13, lineHeight: 18 },
}));

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { deviceId } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(fallback);
  const [modal, setModal] = useState(false);
  const [label, setLabel] = useState("");
  const [spoken, setSpoken] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api.getSettings().then(setSettings).catch(() => setSettings(fallback));
  }, []);

  const update = async (next: AppSettings) => {
    setSettings(next);
    setStatus("Saving…");
    try {
      await api.updateSettings(next);
      setStatus("Saved");
    } catch {
      setStatus("Saved on this device for now");
    }
    setTimeout(() => setStatus(""), 1800);
  };

  const resetForm = () => {
    setLabel("");
    setSpoken("");
    setDescription("");
    setImageUri(null);
    setImageBase64(null);
    setError("");
  };

  const pickFrom = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Camera permission is needed to take a photo.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.5,
          base64: true,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (!result.canceled && result.assets[0]) {
          setImageUri(result.assets[0].uri);
          setImageBase64(result.assets[0].base64 ?? null);
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError("Photos permission is needed to pick an image.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.5,
          base64: true,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (!result.canceled && result.assets[0]) {
          setImageUri(result.assets[0].uri);
          setImageBase64(result.assets[0].base64 ?? null);
        }
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Could not pick an image");
    }
  };

  const saveCustom = async () => {
    if (!label.trim() || !spoken.trim()) {
      setError("Add a name and the phrase it should speak.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.createGesture(
        {
          label,
          spoken_text: spoken,
          description,
          image_base64: imageBase64 ?? undefined,
        },
        deviceId,
      );
      setModal(false);
      resetForm();
      setStatus("Custom sign added");
      setTimeout(() => setStatus(""), 1800);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this sign.");
    } finally {
      setSaving(false);
    }
  };

  const rate = settings.speech_rate <= 0.82 ? "Slower" : settings.speech_rate >= 1.05 ? "Faster" : "Standard";

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28, gap: 17 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.eyebrow}>Preferences</Text>
          <Text style={styles.title}>Make it yours.</Text>
          <Text style={styles.subtitle}>Simple controls for a calmer, more comfortable conversation.</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Speech & feedback</Text>
            <View style={styles.panel}>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons name="volume-high-outline" size={18} color={colors.brandPrimary} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>Automatic speech</Text>
                  <Text style={styles.rowCaption}>Read completed phrases aloud</Text>
                </View>
                <Pressable
                  style={[styles.toggle, settings.auto_speak && styles.toggleOn]}
                  onPress={() => void update({ ...settings, auto_speak: !settings.auto_speak })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: settings.auto_speak }}
                  testID="toggle-auto-speak"
                >
                  <View style={[styles.knob, settings.auto_speak && styles.knobOn]} />
                </Pressable>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons name="pulse-outline" size={18} color={colors.brandPrimary} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>Haptic confirmation</Text>
                  <Text style={styles.rowCaption}>A small tap when a signal arrives</Text>
                </View>
                <Pressable
                  style={[styles.toggle, settings.haptics_enabled && styles.toggleOn]}
                  onPress={() => void update({ ...settings, haptics_enabled: !settings.haptics_enabled })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: settings.haptics_enabled }}
                  testID="toggle-haptics"
                >
                  <View style={[styles.knob, settings.haptics_enabled && styles.knobOn]} />
                </Pressable>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons name="speedometer-outline" size={18} color={colors.brandPrimary} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>Voice pace</Text>
                  <Text style={styles.rowCaption}>Calm guided voice · gpt-4o-mini-tts</Text>
                </View>
              </View>
              <View style={styles.rates}>
                {(
                  [
                    ["Slower", 0.76],
                    ["Standard", 0.92],
                    ["Faster", 1.12],
                  ] as const
                ).map(([name, value]) => (
                  <Pressable
                    key={name}
                    style={[styles.rate, rate === name && styles.rateActive]}
                    onPress={() => void update({ ...settings, speech_rate: value })}
                    testID={`voice-pace-${name.toLowerCase()}`}
                  >
                    <Text style={[styles.rateText, rate === name && styles.rateTextActive]}>{name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your sign library</Text>
            <Pressable
              style={styles.add}
              onPress={() => setModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Add custom gesture"
              testID="add-custom-gesture-button"
            >
              <Ionicons name="add-circle-outline" size={21} color={colors.onBrandPrimary} />
              <Text style={styles.addText}>Add custom gesture</Text>
            </Pressable>
          </View>

          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      </ScrollView>

      <Modal
        visible={modal}
        animationType="slide"
        onRequestClose={() => {
          setModal(false);
          resetForm();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: colors.surface }}
        >
          <ScrollView
            contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable onPress={Keyboard.dismiss} accessibilityRole="none">
              <Text style={styles.eyebrow}>Custom sign</Text>
              <Text style={styles.modalTitle}>Teach the app a phrase.</Text>
              <Text style={styles.subtitle}>Attach a visual example so you (or the hardware team) can map it later.</Text>
            </Pressable>

            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Sign name (e.g. Thumbs sideways)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="custom-sign-label"
            />
            <TextInput
              value={spoken}
              onChangeText={setSpoken}
              placeholder="What should it say?"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="custom-sign-spoken"
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional note"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 72, textAlignVertical: "top", paddingTop: 14 }]}
              multiline
              testID="custom-sign-description"
            />

            <View style={styles.previewWrap}>
              {imageUri ? (
                <>
                  <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" />
                  <Pressable
                    style={styles.previewClear}
                    onPress={() => {
                      setImageUri(null);
                      setImageBase64(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    testID="custom-sign-remove-image"
                  >
                    <Ionicons name="close" size={18} color="#FFFFFF" />
                  </Pressable>
                </>
              ) : (
                <View style={styles.previewEmpty}>
                  <Ionicons name="image-outline" size={28} color={colors.muted} />
                  <Text style={styles.previewHint}>Add a photo of the hand sign</Text>
                </View>
              )}
            </View>

            <View style={styles.imagePickerRow}>
              <Pressable
                style={styles.pickerBtn}
                onPress={() => void pickFrom("camera")}
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
                testID="custom-sign-camera"
              >
                <Ionicons name="camera-outline" size={18} color={colors.onSurfaceTertiary} />
                <Text style={styles.pickerBtnText}>Take photo</Text>
              </Pressable>
              <Pressable
                style={styles.pickerBtn}
                onPress={() => void pickFrom("library")}
                accessibilityRole="button"
                accessibilityLabel="Pick from library"
                testID="custom-sign-library"
              >
                <Ionicons name="images-outline" size={18} color={colors.onSurfaceTertiary} />
                <Text style={styles.pickerBtnText}>Pick from library</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  setModal(false);
                  resetForm();
                }}
                testID="custom-sign-cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.save}
                onPress={() => void saveCustom()}
                disabled={saving}
                testID="custom-sign-save"
              >
                <Text style={styles.saveText}>{saving ? "Saving…" : "Save sign"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
