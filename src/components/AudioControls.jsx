import { Volume2, VolumeX, Square } from "lucide-react";
import Button from "./Button";

export default function AudioControls({ isMuted, toggleMute, volume, handleVolumeChange, stopAllSounds, audiosCount }) {
  return (
    <div className="w-full max-w-[380px] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Button
          icon={isMuted ? VolumeX : Volume2}
          onClick={toggleMute}
          variant={isMuted ? "danger" : "toggle"}
          active={!isMuted}
          size="sm"
          className="flex-1"
        >
          {isMuted ? "Muet" : "Son Activé"}
        </Button>

        <div className="flex items-center gap-2 bg-white/[0.02] border border-white/5 px-3 h-10 rounded-xl">
          <span className="text-[10px] uppercase font-bold tracking-wider text-white/40">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-24 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>
      </div>

      <Button
        icon={Square}
        onClick={() => stopAllSounds({ broadcast: true })}
        variant="danger"
        size="md"
        className="w-full"
      >
        Stop Tous les Sons
      </Button>

      {audiosCount > 0 && (
        <div className="text-[10px] font-medium text-center text-purple-400/70 tracking-wider uppercase animate-pulse">
          Sons actifs : {audiosCount}
        </div>
      )}
    </div>
  );
}
