import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F9F8F6",
  onSurface: "#1C1C1E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "#EFEEEA",
  onSurfaceTertiary: "#3A3A3C",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#F9F8F6",
  muted: "#706E69",
  brand: "#3B7A57",
  onBrand: "#FFFFFF",
  brandPrimary: "#3B7A57",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#52796F",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E2ECE9",
  onBrandTertiary: "#2F4F4F",
  success: "#2D6A4F",
  onSuccess: "#FFFFFF",
  warning: "#C86D39",
  onWarning: "#FFFFFF",
  error: "#B83B27",
  onError: "#FFFFFF",
  info: "#3A6073",
  onInfo: "#FFFFFF",
  border: "#DCDAD4",
  borderStrong: "#8C8983",
  divider: "#E8E6E1",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "dark" && themes.dark ? "dark" : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}