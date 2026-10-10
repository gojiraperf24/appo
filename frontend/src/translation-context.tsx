import * as Haptics from "expo-haptics";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import { api } from "./api";
import { bleSimulator } from "./bluetooth.simulator";
import { wifi } from "./wifi";
import { storage } from "./utils/storage";
import type { BluetoothState, ContextMode, HistoryItem } from "./types";

type InputMode = "Bluetooth glove" | "Wi-Fi (ESP32)" | "Camera" | "Demo mode";

type TranslationContextValue = {
  tokens: string[];
  sentence: string;
  inputMode: InputMode;
  connectionState: BluetoothState;
  contextMode: ContextMode;
  deviceId: string;
  history: HistoryItem[];
  favorites: Set<string>;
  demoActive: boolean;
  wifiActive: boolean;
  wifiUrl: string;
  setInputMode: (mode: InputMode) => void;
  setConnectionState: (state: BluetoothState) => void;
  setContextMode: (mode: ContextMode) => void;
  addToken: (value: string) => void;
  clearSentence: () => void;
  commitSentence: () => Promise<void>;
  startDemoMode: () => void;
  stopDemoMode: () => void;
  connectWifi: (url: string) => Promise<void>;
  disconnectWifi: () => void;
  setWifiUrl: (url: string) => Promise<void>;
  toggleFavorite: (gestureId: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

const CONTEXT_KEY = "signwave.context_mode";
const DEVICE_KEY = "signwave.device_id";
const WIFI_URL_KEY = "signwave.wifi_url";

function makeDeviceId(): string {
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 10);
  return `sw-${timePart}-${randPart}`;
}

export function TranslationProvider({ children }: PropsWithChildren) {
  const [tokens, setTokens] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("Bluetooth glove");
  const [connectionState, setConnectionState] = useState<BluetoothState>("ready");
  const [contextMode, setContextModeState] = useState<ContextMode>("Everyday");
  const [deviceId, setDeviceId] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [demoActive, setDemoActive] = useState(false);
  const [wifiActive, setWifiActive] = useState(false);
  const [wifiUrl, setWifiUrlState] = useState<string>("");
  const demoUnsubscribe = useRef<(() => void) | null>(null);
  const wifiUnsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    (async () => {
      const savedMode = (await storage.getItem<ContextMode>(CONTEXT_KEY, "Everyday")) ?? "Everyday";
      setContextModeState(savedMode);
      let id = (await storage.getItem<string>(DEVICE_KEY, "")) ?? "";
      if (!id) {
        id = makeDeviceId();
        await storage.setItem(DEVICE_KEY, id);
      }
      setDeviceId(id);
      const savedWifi = (await storage.getItem<string>(WIFI_URL_KEY, "")) ?? "";
      setWifiUrlState(savedWifi);
      try {
        const [favs, hist] = await Promise.all([api.getFavorites(id), api.getHistory(id)]);
        setFavorites(new Set(favs));
        setHistory(hist);
      } catch {
        // ignore boot errors
      }
    })();
    return () => {
      demoUnsubscribe.current?.();
      wifiUnsubscribe.current?.();
      bleSimulator.stop();
      wifi.disconnect();
    };
  }, []);

  const setContextMode = useCallback(async (mode: ContextMode) => {
    setContextModeState(mode);
    await storage.setItem(CONTEXT_KEY, mode);
    if (bleSimulator.isActive()) {
      bleSimulator.start(mode);
    }
  }, []);

  const addToken = useCallback((value: string) => {
    const token = value.trim();
    if (!token) return;
    if (token.toUpperCase() === "CLEAR") {
      setTokens([]);
      return;
    }
    setTokens((current) => [...current, token]);
    if (Platform.OS !== "web") void Haptics.selectionAsync();
  }, []);

  const clearSentence = useCallback(() => setTokens([]), []);

  const refreshHistory = useCallback(async () => {
    if (!deviceId) return;
    try {
      setHistory(await api.getHistory(deviceId));
    } catch {
      // ignore
    }
  }, [deviceId]);

  const commitSentence = useCallback(async () => {
    const text = tokens.join(" ").trim();
    if (!text || !deviceId) return;
    try {
      const item = await api.addHistory(deviceId, text, contextMode);
      setHistory((current) => [item, ...current].slice(0, 20));
    } catch {
      // ignore
    }
  }, [tokens, deviceId, contextMode]);

  const clearHistory = useCallback(async () => {
    if (!deviceId) return;
    try {
      await api.clearHistory(deviceId);
      setHistory([]);
    } catch {
      // ignore
    }
  }, [deviceId]);

  const refreshFavorites = useCallback(async () => {
    if (!deviceId) return;
    try {
      setFavorites(new Set(await api.getFavorites(deviceId)));
    } catch {
      // ignore
    }
  }, [deviceId]);

  const toggleFavorite = useCallback(
    async (gestureId: string) => {
      if (!deviceId) return;
      const already = favorites.has(gestureId);
      const next = new Set(favorites);
      if (already) {
        next.delete(gestureId);
      } else {
        next.add(gestureId);
      }
      setFavorites(next);
      try {
        if (already) {
          await api.removeFavorite(deviceId, gestureId);
        } else {
          await api.addFavorite(deviceId, gestureId);
        }
      } catch {
        setFavorites(favorites);
      }
    },
    [deviceId, favorites],
  );

  const startDemoMode = useCallback(() => {
    demoUnsubscribe.current?.();
    demoUnsubscribe.current = bleSimulator.subscribe(addToken);
    bleSimulator.start(contextMode);
    setDemoActive(true);
    setInputMode("Demo mode");
    setConnectionState("demo");
  }, [addToken, contextMode]);

  const stopDemoMode = useCallback(() => {
    bleSimulator.stop();
    demoUnsubscribe.current?.();
    demoUnsubscribe.current = null;
    setDemoActive(false);
    setConnectionState("ready");
    setInputMode("Bluetooth glove");
  }, []);

  const setWifiUrl = useCallback(async (url: string) => {
    setWifiUrlState(url);
    await storage.setItem(WIFI_URL_KEY, url);
  }, []);

  const connectWifi = useCallback(
    async (url: string) => {
      await setWifiUrl(url);
      await wifi.connect(url);
      wifiUnsubscribe.current?.();
      wifiUnsubscribe.current = wifi.subscribe(addToken);
      setWifiActive(true);
      setInputMode("Wi-Fi (ESP32)");
      setConnectionState("wifi");
    },
    [addToken, setWifiUrl],
  );

  const disconnectWifi = useCallback(() => {
    wifi.disconnect();
    wifiUnsubscribe.current?.();
    wifiUnsubscribe.current = null;
    setWifiActive(false);
    if (!demoActive) {
      setConnectionState("ready");
      setInputMode("Bluetooth glove");
    }
  }, [demoActive]);

  const value = useMemo<TranslationContextValue>(
    () => ({
      tokens,
      sentence: tokens.join(" "),
      inputMode,
      connectionState,
      contextMode,
      deviceId,
      history,
      favorites,
      demoActive,
      wifiActive,
      wifiUrl,
      setInputMode,
      setConnectionState,
      setContextMode,
      addToken,
      clearSentence,
      commitSentence,
      startDemoMode,
      stopDemoMode,
      connectWifi,
      disconnectWifi,
      setWifiUrl,
      toggleFavorite,
      refreshFavorites,
      refreshHistory,
      clearHistory,
    }),
    [
      tokens,
      inputMode,
      connectionState,
      contextMode,
      deviceId,
      history,
      favorites,
      demoActive,
      wifiActive,
      wifiUrl,
      addToken,
      clearSentence,
      commitSentence,
      setContextMode,
      startDemoMode,
      stopDemoMode,
      connectWifi,
      disconnectWifi,
      setWifiUrl,
      toggleFavorite,
      refreshFavorites,
      refreshHistory,
      clearHistory,
    ],
  );
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useTranslation must be used inside TranslationProvider");
  return context;
}
