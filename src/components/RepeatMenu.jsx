import { motion } from "framer-motion";
import { Clock3, Headphones, Music, Repeat2, Volume2, X } from "lucide-react";
import Button from "./Button";

export default function RepeatMenu({
  isOpen,
  audioList,
  playTrack,
  playTrackLoop,
  playAudio,
  repeatDelays,
  activeLoops,
  formatRepeatDelay,
  openRepeatDelayEditor,
  toggleMenu,
}) {
  const audioFiles = audioList?.filter((file) => !file.isFolder) || [];
  const activeFiles = audioFiles.filter((file) => activeLoops?.[file.path || file.url]);

  const renderTrack = (file) => {
    const trackKey = file.path || file.url;
    const repeatDelay = Number(repeatDelays?.[trackKey]) || 0;
    const repeatActive = Boolean(activeLoops?.[trackKey]);
    const displayName = file.name.replace(/\.(mp3|wav)$/i, "");

    return (
      <div
        key={trackKey}
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2.5 text-xs transition-all ${
          repeatActive
            ? "border-emerald-400/30 bg-emerald-400/[0.04]"
            : "border-white/5 bg-white/[0.02] hover:border-emerald-400/20 hover:bg-emerald-400/[0.02]"
        }`}
      >
        <div className="min-w-0 flex items-center gap-2 text-white/70">
          <Music size={14} className={repeatActive ? "text-emerald-300 shrink-0" : "text-purple-300 shrink-0"} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-white/80">{displayName}</div>
            <div className="mt-0.5 font-mono text-[10px] text-white/35">
              {repeatDelay > 0 ? formatRepeatDelay(repeatDelay) : "immédiat"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 items-center gap-1">
          <Button
            icon={Clock3}
            size="icon"
            variant="toggle"
            active={repeatDelay > 0}
            onClick={() => { openRepeatDelayEditor(file); toggleMenu(); }}
            className={`h-7 w-7 justify-self-center ${repeatDelay > 0 ? "text-emerald-200" : "text-white/30 hover:text-emerald-300"}`}
            title="Régler le délai"
          />
          <Button
            icon={Repeat2}
            size="icon"
            variant="toggle"
            active={repeatActive}
            onClick={() => playTrackLoop(file.url, trackKey, displayName)}
            className={`h-7 w-7 justify-self-center ${repeatActive ? "text-emerald-300" : "text-white/30 hover:text-emerald-300"}`}
            title={repeatActive ? "Arrêter cette boucle" : "Démarrer la répétition"}
          />
          <Button
            icon={Volume2}
            size="icon"
            variant="ghost"
            onClick={() => playTrack(file.url, displayName)}
            className="h-7 w-7 justify-self-center text-white/30 hover:text-purple-300"
            title="Jouer pour tous"
          />
          <Button
            icon={Headphones}
            size="icon"
            variant="ghost"
            onClick={() => playAudio(file.url)}
            className="h-7 w-7 justify-self-center text-white/30 hover:text-purple-300"
            title="Solo"
          />
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ x: -340 }}
      animate={{ x: isOpen ? 0 : -340 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed top-0 left-0 h-full w-[320px] bg-[#0d0b14]/90 backdrop-blur-xl border-r border-white/10 p-5 z-50 flex flex-col gap-5 overflow-y-auto shadow-[5px_0_30px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
          <Repeat2 size={14} />
          <span>Répétitions</span>
        </div>
        <button onClick={toggleMenu} className="text-white/40 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider font-bold text-white/30">Actives</h3>
        {activeFiles.length === 0 && (
          <span className="text-xs text-white/30 block italic pl-1">Aucune boucle active</span>
        )}
        <div className="flex flex-col gap-2">
          {activeFiles.map(renderTrack)}
        </div>
      </div>

      <div className="space-y-2 flex-1">
        <h3 className="text-[10px] uppercase tracking-wider font-bold text-white/30">Pistes du dossier</h3>
        {audioFiles.length === 0 && (
          <span className="text-xs text-white/30 block italic pl-1">Aucune piste audio</span>
        )}
        <div className="flex flex-col gap-2">
          {audioFiles.map(renderTrack)}
        </div>
      </div>
    </motion.div>
  );
}
