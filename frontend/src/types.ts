export type GestureCategory = "All" | "Fixed" | "Alphabet" | "Scuba" | "Bike" | "Custom";

export type Gesture = {
  id: string;
  label: string;
  spoken_text: string;
  category: Exclude<GestureCategory, "All">;
  description: string;
  icon: string;
  source: string;
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

export type BluetoothState = "unavailable" | "scanning" | "ready" | "connected" | "error";