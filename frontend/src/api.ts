import Constants from "expo-constants";
import type { AppSettings, Gesture } from "./types";

const backendUrl = String(
  Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? "",
).replace(/\/$/, "");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getGestures: (category?: string) => request<Gesture[]>(`/gestures${category && category !== "All" ? `?category=${encodeURIComponent(category)}` : ""}`),
  createGesture: (payload: Pick<Gesture, "label" | "spoken_text" | "description">) =>
    request<Gesture>("/gestures", { method: "POST", body: JSON.stringify(payload) }),
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (settings: AppSettings) => request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
  speak: (text: string, speed: number) => request<{ audio_url: string; model: string }>("/speak", { method: "POST", body: JSON.stringify({ text, speed }) }),
  absoluteUrl: (path: string) => `${backendUrl}${path}`,
};