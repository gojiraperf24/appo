export type GestureCategory = "All" | "Fixed" | "Alphabet" | "Scuba" | "Bike" | "Custom" | "Favorites";

export type ContextMode = "Everyday" | "Riding" | "Scuba";

export type Gesture = {
  id: string;
  label: string;
  spoken_text: string;
  category: Exclude<GestureCategory, "All" | "Favorites">;
  description: string;
  icon: string;
  source: string;
  context_overrides?: Record<string, string>;
  image_path?: string | null;
};

export type AppSettings = {
  auto_speak: boolean;
  speech_rate: number;
  haptics_enabled: boolean;
};

export type BluetoothDevice = {
  id: string;
  name: string;
  rssi?: number | null;
};

export type BluetoothState =
  | "unavailable"
  | "scanning"
  | "ready"
  | "connected"
  | "error"
  | "demo"
  | "wifi";

export type QuickPhrase = {
  id: string;
  text: string;
  icon: string;
  context_mode: string;
};

export type HistoryItem = {
  id: string;
  device_id: string;
  sentence: string;
  context_mode: string;
  timestamp: string;
};

export type RecognizeResponse = {
  label: string;
  spoken_text: string;
  confidence: "high" | "medium" | "low" | "none";
};

export type TransportKind = "Bluetooth" | "Wi-Fi" | "Demo" | "Camera";
