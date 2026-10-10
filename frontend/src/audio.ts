import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { api } from "./api";

let player: ReturnType<typeof createAudioPlayer> | null = null;

export async function speakSentence(text: string, speed: number) {
  const { audio_url } = await api.speak(text, speed);
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  player ??= createAudioPlayer();
  player.replace(api.absoluteUrl(audio_url));
  player.play();
}

export function stopSpeaking() {
  player?.pause();
}