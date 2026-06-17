import { Volume2, VolumeX, Square } from "lucide-react";

export default function AudioControls({ isMuted, toggleMute, volume, handleVolumeChange, stopAllSounds, audiosCount }) {
  return (
    <div className="w-full max-w-[380px] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={toggleMute}
          className={`flex-1 h-10 flex items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
            isMuted 
              ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" 
              : "bg-white/[0.03] border-white/10 text-white/80 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          {isMuted ? "Muet" : "Son Activé"}
        </button>

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

      <button
        onClick={stopAllSounds}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-red-950/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 transition-all duration-300 text-xs font-bold border border-red-500/20 hover:border-red-500/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.1)]"
      >
        <Square size={14} className="fill-current" />
        Stop Tous les Sons
      </button>

      {audiosCount > 0 && (
        <div className="text-[10px] font-medium text-center text-purple-400/70 tracking-wider uppercase animate-pulse">
          Sons actifs : {audiosCount}
        </div>
      )}
    </div>
  );
}