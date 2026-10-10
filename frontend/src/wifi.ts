// Wi-Fi transport for ESP32 Wroom.
// The ESP32 sketch should expose a WebSocket server (common port 81) that
// pushes recognised gesture tokens as plain text, one per message, or a short
// JSON frame like {"token": "Hello"}. Each message is forwarded as-is to the
// sentence builder.

type Listener = (token: string) => void;

let socket: WebSocket | null = null;
let listeners: Listener[] = [];

function parseFrame(data: unknown): string[] {
  if (typeof data !== "string") return [];
  const trimmed = data.trim();
  if (!trimmed) return [];
  // Try JSON envelope first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        const value = parsed.token ?? parsed.word ?? parsed.label ?? parsed.text;
        if (typeof value === "string") return [value];
      }
    } catch {
      // fall through to plain-text parsing
    }
  }
  return trimmed
    .split(/[\r\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normaliseWifiUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (/^wss?:\/\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value.replace(/^http/i, "ws");
  // Bare host or host:port
  const hostOnly = value.replace(/^\/+/, "");
  const hasPort = /:\d+/.test(hostOnly);
  return `ws://${hostOnly}${hasPort ? "" : ":81"}`;
}

export const wifi = {
  isConnected(): boolean {
    return !!socket && socket.readyState === WebSocket.OPEN;
  },
  connect(url: string, timeoutMs = 7000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      const target = normaliseWifiUrl(url);
      if (!target) {
        reject(new Error("Please enter an ESP32 address like 192.168.1.50 or ws://192.168.1.50:81"));
        return;
      }
      let ws: WebSocket;
      try {
        ws = new WebSocket(target);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not open Wi-Fi connection"));
        return;
      }
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error("Could not reach the ESP32 at this address"));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        socket = ws;
        resolve();
      };
      ws.onmessage = (event) => {
        for (const token of parseFrame(event.data)) {
          listeners.forEach((listener) => listener(token));
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        if (!socket) reject(new Error("Could not reach the ESP32 at this address"));
      };
      ws.onclose = () => {
        if (socket === ws) socket = null;
      };
    });
  },
  disconnect() {
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
      socket = null;
    }
  },
  subscribe(listener: Listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((entry) => entry !== listener);
    };
  },
};
