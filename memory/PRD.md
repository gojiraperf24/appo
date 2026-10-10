# SignWave Connect — Product Requirements (Session 3)

## Summary
Accessible, mobile-first communication assistant for speech-impaired users. The app translates incoming gesture signals (from a Bluetooth/Wi-Fi ESP32 glove or a camera) into text, builds a readable sentence, and speaks it aloud with a natural voice.

## Core features

### 1. Live Translate (`app/(tabs)/index.tsx`)
- Context chips: **Everyday / Riding / Scuba** (persisted via AsyncStorage).
- Live sentence card with running token ticker and status pill (Ready / Connected / Wi-Fi live / Demo stream).
- **Quick-phrase** chip row — common sentences filtered by context.
- **Speak aloud** — backend OpenAI TTS via Emergent Universal Key; played with `expo-audio`. Successful speak auto-saves to history.
- **Recent sentences** list — tap to replay through TTS.
- Secondary button labelled **"Camera"** (was "Camera backup").

### 2. Connect (`app/(tabs)/connect.tsx`)
- **Wi-Fi (ESP32)** card — enter the ESP32 Wroom WebSocket URL (`192.168.1.50`, `host:81`, `ws://host:81`). On connect, incoming text/JSON frames become sentence tokens. URL persists via AsyncStorage.
- **Demo Mode** card — two options:
  - **Simulator**: streams context-aware mock gesture packets every ~2 s.
  - **Camera demo**: opens the camera and auto-captures every ~3 s, sending each frame to the vision model.
- **Bluetooth** card — scan + pair real BLE device (Nordic UART service).

### 3. Signs (`app/(tabs)/signs.tsx`)
- Context chips (Everyday / Riding / Scuba) that drive meaning overrides.
- Category filters: **All, Favorites, Fixed, Alphabet, Scuba, Bike, Custom**.
- 90+ seeded signs: 26 Alphabet letters A-Z, 30 common ASL/everyday signs, 18 motorcycle hand signals, 18 scuba diving signals.
- Each gesture card shows base spoken text and a highlighted alternate meaning when the active context overrides it (e.g., OK = "I am okay" in Scuba, "All clear, keep riding" in Riding).
- Favorite / unfavorite via per-device favorites API.
- **Thumbnail**: custom gestures with an uploaded image render that photo instead of the icon.

### 4. Camera (`app/camera.tsx`)
- Permission flow with `canAskAgain` + Open Settings deep-link.
- Manual front/back lens switching.
- Manual capture button → sends base64 frame to backend vision model (`gpt-5.4-mini`) → best match appended to sentence.
- **Demo mode** (`?mode=demo`) auto-captures every 3.2 s with a pause/resume toggle.

### 5. Settings (`app/(tabs)/settings.tsx`)
- Auto-speak, haptics, voice pace (Slower/Standard/Faster).
- **Add custom gesture** modal — label + spoken text + optional description + **visual example** (Take photo OR Pick from library via `expo-image-picker`). Image is uploaded through FastAPI to Emergent Object Storage; the gesture document stores a `storage_path`, and the Signs tab renders it via `/api/files/{path}`.

## Backend (`backend/server.py`)
FastAPI + Motor (MongoDB). All routes under `/api`.

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| GET    | `/gestures`              | Seeded + custom gestures (90+); supports `?category=` and `?device_id=` for Custom scoping |
| POST   | `/gestures`              | Create custom gesture; accepts optional `image_base64` → uploaded to Object Storage |
| GET/PUT| `/settings`              | App settings |
| POST   | `/speak`                 | OpenAI TTS → cached mp3 (`/api/tts/{sha}.mp3`) |
| GET    | `/tts/{sha}.{ext}`       | Serve cached audio |
| GET    | `/files/{path}`          | Serve Object Storage files (custom gesture images) |
| POST   | `/recognize-gesture`     | Vision classify base64 image → `{label, spoken_text, confidence}` |
| GET    | `/quick-phrases`         | Context-filtered common phrases |
| GET/POST/DELETE | `/history`      | Per-device sentence history |
| GET/POST/DELETE | `/favorites`    | Per-device favorite gesture ids |

## Data model (MongoDB)
- `gestures`: id, label, spoken_text, category, description, icon, source, context_overrides, **image_path**, device_id (Custom only)
- `app_settings`: auto_speak, speech_rate, haptics_enabled
- `quick_phrases`: id, text, icon, context_mode
- `history`: id, device_id, sentence, context_mode, timestamp
- `favorites`: device_id, gesture_id

## Integrations
- **Emergent Universal LLM Key** powers:
  - Server-side **OpenAI TTS** (`gpt-4o-mini-tts` → `tts-1` fallback) via `emergentintegrations`.
  - Server-side **vision classification** (`gpt-5.4-mini`) via `LlmChat` with `ImageContent`.
  - **Emergent Object Storage** for custom-gesture images (`signwave-connect/custom-gestures/<uuid>.jpg`).
- **expo-audio** for TTS playback, **expo-camera** for frame capture, **expo-image-picker** for custom-gesture images.
- **@sfourdrinier/react-native-ble-plx** for the BLE link; native **WebSocket** for the Wi-Fi link.
- **AsyncStorage** via `@/src/utils/storage` for context mode, device id, and Wi-Fi URL persistence.

## Accessibility
- 44pt+ touch targets; test IDs on every interactive element.
- High-contrast botanical theme from `src/theme.ts`.
- `canAskAgain` handling + Open Settings deep-link on camera and image-picker permissions.
- All text in `<Text>`; safe-area aware screens.

## Known gaps / roadmap
1. Real glove BLE/Wi-Fi protocol specifics (service UUID, packet framing, JSON schema) still need field validation against the physical ESP32 prototype.
2. Vision recognition is per-capture; a true streaming mode is possible but adds LLM cost.
3. Multi-user auth / server-side device registry is not implemented (device_id is anonymous and persisted locally).
4. Push notifications are **not** implemented (requires deployment + device build).
