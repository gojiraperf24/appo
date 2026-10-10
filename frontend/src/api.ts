import Constants from "expo-constants";
import type {
  AppSettings,
  ContextMode,
  Gesture,
  HistoryItem,
  QuickPhrase,
  RecognizeResponse,
} from "./types";

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

export type CustomGesturePayload = {
  label: string;
  spoken_text: string;
  description?: string;
  image_base64?: string;
};

export const api = {
  getGestures: (category?: string, deviceId?: string) => {
    const params = new URLSearchParams();
    if (category && category !== "All" && category !== "Favorites") {
      params.set("category", category);
    }
    if (deviceId) params.set("device_id", deviceId);
    const qs = params.toString();
    return request<Gesture[]>(`/gestures${qs ? `?${qs}` : ""}`);
  },
  createGesture: (payload: CustomGesturePayload, deviceId?: string) =>
    request<Gesture>(`/gestures${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (settings: AppSettings) =>
    request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
  speak: (text: string, speed: number) =>
    request<{ audio_url: string; model: string }>("/speak", {
      method: "POST",
      body: JSON.stringify({ text, speed }),
    }),
  recognizeGesture: (image_base64: string, context_mode: ContextMode, vocabulary: string[]) =>
    request<RecognizeResponse>("/recognize-gesture", {
      method: "POST",
      body: JSON.stringify({ image_base64, context_mode, vocabulary }),
    }),
  getQuickPhrases: (context_mode?: ContextMode) =>
    request<QuickPhrase[]>(
      `/quick-phrases${context_mode ? `?context_mode=${encodeURIComponent(context_mode)}` : ""}`,
    ),
  getHistory: (device_id: string) =>
    request<HistoryItem[]>(`/history?device_id=${encodeURIComponent(device_id)}`),
  addHistory: (device_id: string, sentence: string, context_mode: ContextMode) =>
    request<HistoryItem>("/history", {
      method: "POST",
      body: JSON.stringify({ device_id, sentence, context_mode }),
    }),
  clearHistory: (device_id: string) =>
    request<{ deleted: number }>(`/history?device_id=${encodeURIComponent(device_id)}`, {
      method: "DELETE",
    }),
  getFavorites: (device_id: string) =>
    request<string[]>(`/favorites?device_id=${encodeURIComponent(device_id)}`),
  addFavorite: (device_id: string, gesture_id: string) =>
    request<{ ok: boolean }>("/favorites", {
      method: "POST",
      body: JSON.stringify({ device_id, gesture_id }),
    }),
  removeFavorite: (device_id: string, gesture_id: string) =>
    request<{ ok: boolean }>(
      `/favorites?device_id=${encodeURIComponent(device_id)}&gesture_id=${encodeURIComponent(gesture_id)}`,
      { method: "DELETE" },
    ),
  absoluteUrl: (path: string) => `${backendUrl}${path}`,
  fileUrl: (storagePath?: string | null) =>
    storagePath ? `${backendUrl}/api/files/${storagePath.replace(/^\/+/, "")}` : null,
};
