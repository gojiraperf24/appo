import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import type { ContextMode, Gesture, GestureCategory } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";
import { useTranslation } from "@/src/translation-context";

const categories: GestureCategory[] = ["All", "Favorites", "Fixed", "Alphabet", "Scuba", "Bike", "Custom"];

const CONTEXTS: { mode: ContextMode; label: string }[] = [
  { mode: "Everyday", label: "Everyday" },
  { mode: "Riding", label: "Riding" },
  { mode: "Scuba", label: "Scuba" },
];

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 16 },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  search: { height: 50, borderRadius: 15, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, color: colors.onSurface, fontSize: 15 },
  rowLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  filters: { gap: 8, paddingVertical: 2 },
  filter: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceTertiary, justifyContent: "center" },
  filterActive: { backgroundColor: colors.brandPrimary },
  filterText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  filterTextActive: { color: colors.onBrandPrimary },
  contextChip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", gap: 6 },
  contextChipActive: { backgroundColor: colors.brandPrimary },
  resultCount: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", gap: 12, alignItems: "center" },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  thumbnail: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.surfaceTertiary },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  cardMeaning: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  cardOverride: { color: colors.warning, fontSize: 12, fontWeight: "700", fontStyle: "italic" },
  cardDesc: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  category: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  starBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  error: { color: colors.error, fontSize: 13, textAlign: "center", lineHeight: 20 },
  retry: { color: colors.brandPrimary, fontSize: 14, fontWeight: "800" },
}));

export default function SignsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { contextMode, setContextMode, favorites, toggleFavorite, refreshFavorites, deviceId } = useTranslation();
  const [category, setCategory] = useState<GestureCategory>("All");
  const [query, setQuery] = useState("");
  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list =
        category === "Favorites"
          ? await api.getGestures("All", deviceId)
          : await api.getGestures(category, deviceId);
      setGestures(list);
      await refreshFavorites();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the sign library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const filtered = useMemo(() => {
    const base = category === "Favorites" ? gestures.filter((g) => favorites.has(g.id)) : gestures;
    return base.filter((gesture) =>
      `${gesture.label} ${gesture.description} ${gesture.spoken_text}`.toLowerCase().includes(query.toLowerCase()),
    );
  }, [gestures, favorites, category, query]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.eyebrow}>Sign library</Text>
          <Text style={styles.title}>Find the right sign.</Text>
          <Text style={styles.subtitle}>
            One sign can mean different things across contexts. Set your context, then explore signs that adapt automatically.
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search signs or phrases"
            placeholderTextColor={colors.muted}
            style={styles.search}
            accessibilityLabel="Search sign library"
            testID="signs-search-input"
          />

          <Text style={styles.rowLabel}>Context</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {CONTEXTS.map((ctx) => {
              const active = contextMode === ctx.mode;
              return (
                <Pressable
                  key={ctx.mode}
                  testID={`signs-context-${ctx.mode.toLowerCase()}`}
                  style={[styles.contextChip, active && styles.contextChipActive]}
                  onPress={() => void setContextMode(ctx.mode)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{ctx.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.rowLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {categories.map((item) => (
              <Pressable
                key={item}
                testID={`signs-filter-${item.toLowerCase()}`}
                style={[styles.filter, item === category && styles.filterActive]}
                onPress={() => setCategory(item)}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${item}`}
              >
                <Text style={[styles.filterText, item === category && styles.filterTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.resultCount}>
            {loading ? "Loading sign library…" : `${filtered.length} signs in ${contextMode} · ${category}`}
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : error ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.error} />
              <Text style={styles.error}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Try again</Text>
              </Pressable>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name={category === "Favorites" ? "star-outline" : "search-outline"}
                size={30}
                color={colors.muted}
              />
              <Text style={styles.emptyText}>
                {category === "Favorites" ? "No favorites yet" : "No signs found"}
              </Text>
              <Text style={styles.error}>
                {category === "Favorites" ? "Tap the star on any sign to add it here." : "Try a different word or category."}
              </Text>
            </View>
          ) : (
            filtered.map((gesture) => {
              const override = gesture.context_overrides?.[contextMode];
              const starred = favorites.has(gesture.id);
              const imageUrl = api.fileUrl(gesture.image_path);
              return (
                <View style={styles.card} key={gesture.id} testID={`sign-card-${gesture.id}`}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.thumbnail} contentFit="cover" transition={200} />
                  ) : (
                    <View style={styles.icon}>
                      <Ionicons
                        name={gesture.icon as keyof typeof Ionicons.glyphMap}
                        size={22}
                        color={colors.brandPrimary}
                      />
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <Text style={styles.category}>
                      {gesture.category} · {gesture.source}
                    </Text>
                    <Text style={styles.cardTitle}>{gesture.label}</Text>
                    <Text style={styles.cardMeaning}>
                      → {override || gesture.spoken_text}
                    </Text>
                    {override ? (
                      <Text style={styles.cardOverride}>Means something different in {contextMode}</Text>
                    ) : null}
                    <Text style={styles.cardDesc}>{gesture.description}</Text>
                  </View>
                  <Pressable
                    style={styles.starBtn}
                    onPress={() => void toggleFavorite(gesture.id)}
                    accessibilityRole="button"
                    accessibilityLabel={starred ? `Unfavorite ${gesture.label}` : `Favorite ${gesture.label}`}
                    testID={`favorite-${gesture.id}`}
                  >
                    <Ionicons
                      name={starred ? "star" : "star-outline"}
                      size={20}
                      color={starred ? colors.warning : colors.muted}
                    />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
