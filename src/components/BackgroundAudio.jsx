import { useAudioPlayer } from "../hooks/useAudioPlayer";

export default function BackgroundAudio() {
  const apiUrl = import.meta.env.VITE_SOUND_API_URL || "https://owl-soundboard-backend.vercel.app/api/sounds";

  useAudioPlayer(apiUrl, { backgroundMode: true });
  return null;
}
