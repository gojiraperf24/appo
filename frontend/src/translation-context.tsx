import Haptics from "expo-haptics";
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import type { BluetoothState } from "./types";

type TranslationContextValue = {
  tokens: string[];
  sentence: string;
  inputMode: "Bluetooth glove" | "Camera backup";
  connectionState: BluetoothState;
  setInputMode: (mode: "Bluetooth glove" | "Camera backup") => void;
  setConnectionState: (state: BluetoothState) => void;
  addToken: (value: string) => void;
  clearSentence: () => void;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

export function TranslationProvider({ children }: PropsWithChildren) {
  const [tokens, setTokens] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<"Bluetooth glove" | "Camera backup">("Bluetooth glove");
  const [connectionState, setConnectionState] = useState<BluetoothState>("ready");
  const value = useMemo(() => ({
    tokens,
    sentence: tokens.join(" "),
    inputMode,
    connectionState,
    setInputMode,
    setConnectionState,
    addToken: (value: string) => {
      const token = value.trim();
      if (!token) return;
      if (token.toUpperCase() === "CLEAR") return setTokens([]);
      setTokens((current) => [...current, token]);
      void Haptics.selectionAsync();
    },
    clearSentence: () => setTokens([]),
  }), [tokens, inputMode, connectionState]);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useTranslation must be used inside TranslationProvider");
  return context;
}