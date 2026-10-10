import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
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
import { api } from "./api";
import { bleSimulator } from "./bluetooth.simulator";
import { storage } from "./utils/storage";
import type { BluetoothState, ContextMode, HistoryItem } from "./types";

type InputMode = "Bluetooth glove" | "Camera backup" | "Demo mode";

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
  setInputMode: (mode: InputMode) => void;
  setConnectionState: (state: BluetoothState) => void;
  setContextMode: (mode: ContextMode) => void;
  addToken: (value: string) => void;
  clearSentence: () => void;
  commitSentence: () => Promise<void>;
  startDemoMode: () => void;
  stopDemoMode: () => void;
  toggleFavorite: (gestureId: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

const CONTEXT_KEY = "signwave.context_mode";
const DEVICE_KEY = "signwave.device_id";

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
  const demoUnsubscribe = useRef<(() => void) | null>(null);

  // Boot: load persisted context mode + device id, then refresh favorites and history.
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
      try {
        const [favs, hist] = await Promise.all([api.getFavorites(id), api.getHistory(id)]);
        setFavorites(new Set(favs));
        setHistory(hist);
      } catch {
        // Backend might not be reachable yet — ignore silently; UI will retry.
      }
    })();
    return () => {
      demoUnsubscribe.current?.();
      bleSimulator.stop();
    };
  }, []);

  const setContextMode = useCallback(async (mode: ContextMode) => {
    setContextModeState(mode);
    await storage.setItem(CONTEXT_KEY, mode);
    if (bleSimulator.isActive()) {
      bleSimulator.start(mode); // restart with new vocab
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
      // Keep spoken flow working even if history save fails.
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
        // Roll back on failure
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
      setInputMode,
      setConnectionState,
      setContextMode,
      addToken,
      clearSentence,
      commitSentence,
      startDemoMode,
      stopDemoMode,
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
      addToken,
      clearSentence,
      commitSentence,
      setContextMode,
      startDemoMode,
      stopDemoMode,
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
