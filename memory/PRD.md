# SignWave Connect — Product Requirements

## Summary
Accessible, mobile-first communication assistant for speech-impaired users. The app translates incoming gesture signals (from a Bluetooth sensor glove or a camera backup) into text, builds a readable sentence, and speaks it aloud with a natural voice.

## Core features

### 1. Live Translate (`app/(tabs)/index.tsx`)
- Context chips: **Everyday / Riding / Scuba** (persisted via AsyncStorage).
- Live sentence card with running token ticker and status pill (Ready / Connected / Demo stream).
- **Quick-phrase** chip row — common sentences filtered by context (e.g., "Low on air" shows only in Scuba).
- **Speak aloud** — backend OpenAI TTS (`gpt-4o-mini-tts`, `tts-1` fallback) via Emergent Universal Key; played with `expo-audio`. On successful speak, sentence is auto-saved to history.
- **Recent sentences** list — tap any entry to replay through TTS.

### 2. Connect (`app/(tabs)/connect.tsx`)
- Prominent **Demo Mode** card — simulates realistic gesture packets at ~2s cadence using context-specific vocabulary; feeds the same sentence pipeline so TTS and history can be tested without hardware.
- Real BLE scan + connect flow via `@sfourdrinier/react-native-ble-plx` (Nordic UART service UUIDs; replaceable once real firmware protocol is known).
- States: scanning, ready, connected, error, demo.

### 3. Signs (`app/(tabs)/signs.tsx`)
- Context chips (Everyday / Riding / Scuba) that drive meaning overrides.
- Category filters: **All, Favorites, Fixed, Alphabet, Scuba, Bike, Custom**.
- Each gesture card shows the base spoken text and — when the active context overrides it — a highlighted alternate meaning (e.g., "OK" = "I am okay" in Scuba, "All clear, keep riding" in Riding).
- Favorite / unfavorite via per-device favorites API.

### 4. Camera backup (`app/camera.tsx`)
- Permission flow with `canAskAgain` handling.
- Manual front/back lens switching.
- **Capture button** → takes a photo frame → base64-posts to backend → vision model (`gpt-5.4-mini`) classifies the hand sign against the full vocabulary + current context → best match is appended to the live sentence.
- Returns `{label, spoken_text, confidence}` with `none` when the frame has no identifiable gesture.

### 5. Settings (`app/(tabs)/settings.tsx`)
- Auto-speak, haptics, voice pace (Slower/Standard/Faster).
- Add custom gesture (label + spoken text + description).

## Backend (`backend/server.py`)
FastAPI + Motor (MongoDB). All routes under `/api`.

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| GET    | `/gestures`              | Seeded + custom gestures (ids, labels, context_overrides) |
| POST   | `/gestures`              | Create custom gesture |
| GET/PUT| `/settings`              | App settings |
| POST   | `/speak`                 | OpenAI TTS → cached mp3 (`/api/tts/{sha}.mp3`) |
| GET    | `/tts/{sha}.{ext}`       | Serve cached audio |
| POST   | `/recognize-gesture`     | Vision classify base64 image → `{label, spoken_text, confidence}` |
| GET    | `/quick-phrases`         | Context-filtered common phrases |
| GET/POST/DELETE | `/history`      | Per-device sentence history |
| GET/POST/DELETE | `/favorites`    | Per-device favorite gesture ids |

## Data model (MongoDB)
- `gestures`: id, label, spoken_text, category, description, icon, source, context_overrides
- `app_settings`: auto_speak, speech_rate, haptics_enabled
- `quick_phrases`: id, text, icon, context_mode
- `history`: id, device_id, sentence, context_mode, timestamp
- `favorites`: device_id, gesture_id

## Integrations
- **Emergent Universal LLM Key** powers both:
  - Server-side **OpenAI TTS** (`gpt-4o-mini-tts` → `tts-1` fallback) via `emergentintegrations`.
  - Server-side **vision classification** (`gpt-5.4-mini`) via `LlmChat` with `ImageContent`.
- **expo-audio** for TTS playback.
- **expo-camera** for frame capture.
- **@sfourdrinier/react-native-ble-plx** for the glove BLE link.
- **AsyncStorage / SecureStore** via `@/src/utils/storage` for context mode and device id persistence.

## Accessibility
- 44pt+ touch targets; test IDs on every interactive element.
- High-contrast botanical theme from `src/theme.ts`.
- `canAskAgain` handling + Settings deep-link messaging on camera permission.
- All text in `<Text>`; safe-area aware screens.

## Known gaps / roadmap
1. Real glove BLE protocol (service UUID, characteristic UUID, packet framing) still needs field validation against the physical prototype.
2. Camera recognition is single-shot per capture; a streaming/continuous mode is possible but adds LLM cost.
3. Multi-user auth / server-side device registry is not implemented (device_id is anonymous and persisted locally).
4. Push notifications are **not** implemented (requires deployment + device build).
