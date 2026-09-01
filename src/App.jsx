import React, { useState, useEffect, useCallback } from "react";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import Notification from "./components/Notification";
import Header from "./components/Header";
import AudioControls from "./components/AudioControls";
import AudioSelector from "./components/AudioSelector";
import HelpSection from "./components/HelpSection";
import FavoritesMenu from "./components/FavoritesMenu";
import StarToggle from "./components/StarToggle";
import RepeatMenu from "./components/RepeatMenu";
import RepeatToggle from "./components/RepeatToggle";
import TerminalLog from "./components/TerminalLog";
import TurnstileWidget from "./components/TurnstileWidget";
import Button from "./components/Button";
import { Upload, Loader2, Info, FolderPlus, Check, X, Clock3, RotateCcw, Volume2 } from "lucide-react";

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [repeatMenuOpen, setRepeatMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [repeatEditorTrack, setRepeatEditorTrack] = useState(null);
  const [repeatMinutes, setRepeatMinutes] = useState(0);
  const [repeatSeconds, setRepeatSeconds] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  
  const apiUrl = import.meta.env.VITE_SOUND_API_URL || "https://owl-soundboard-backend.vercel.app/api/sounds";
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const handleTurnstileToken = useCallback((token) => setTurnstileToken(token || ""), []);
  const resetTurnstile = useCallback(() => setTurnstileResetKey((value) => value + 1), []);
  const player = useAudioPlayer(apiUrl, {
    turnstileToken,
    turnstileEnabled: Boolean(turnstileSiteKey),
    resetTurnstile,
  });
  const quota = player.quota;
  const quotaPercent = quota?.limits?.storageBytes
    ? Math.min(100, Math.round((quota.usedBytes / quota.limits.storageBytes) * 100))
    : 0;
  const uploadsPaused = player.service?.uploadsEnabled === false;
  const challengeRequired = Boolean(turnstileSiteKey || player.service?.turnstileRequired);
  const challengeReady = !challengeRequired || Boolean(turnstileToken);
  const securityMisconfigured = Boolean(player.service?.turnstileRequired && !turnstileSiteKey);
  const quotaFull = Boolean(uploadsPaused || quota?.isFull || quota?.remainingFiles <= 0 || quota?.remainingBytes <= 0);

  // Détecter si l'application est ouverte dans une iframe (Owlbear Rodeo) ou seule
  useEffect(() => {
    if (window.self !== window.top) {
      setIsStandalone(false); // On est dans Owlbear Rodeo !
    } else {
      setIsStandalone(true);  // On est seul sur Vercel ou localhost
    }
  }, []);

  const handleCreateFolderSubmit = async (e) => {
    e.preventDefault();
    const created = await player.handleCreateFolder(folderName);
    if (created) {
      setFolderName("");
      setFolderFormOpen(false);
    }
  };

  const openRepeatDelayEditor = (track) => {
    const trackKey = track?.id || track?.path || track?.url;
    if (!trackKey) return;
    const savedDelay = Number(player.repeatDelays?.[trackKey]) || 0;
    setRepeatEditorTrack({ ...track, key: trackKey });
    setRepeatMinutes(Math.floor(savedDelay / 60));
    setRepeatSeconds(savedDelay % 60);
  };

  const handleRepeatDelaySubmit = (e) => {
    e.preventDefault();
    const totalSeconds = (Number(repeatMinutes) || 0) * 60 + (Number(repeatSeconds) || 0);
    player.saveRepeatDelay(repeatEditorTrack?.key, totalSeconds);
    setRepeatEditorTrack(null);
  };

  const handleRepeatDelayReset = () => {
    player.saveRepeatDelay(repeatEditorTrack?.key, 0);
    setRepeatMinutes(0);
    setRepeatSeconds(0);
    setRepeatEditorTrack(null);
  };

  const toggleFavoritesMenu = () => {
    setMenuOpen((current) => {
      const next = !current;
      if (next) setRepeatMenuOpen(false);
      return next;
    });
  };

  const toggleRepeatMenu = () => {
    setRepeatMenuOpen((current) => {
      const next = !current;
      if (next) setMenuOpen(false);
      return next;
    });
  };

  return (
    <div 
      className={`min-h-screen relative text-white antialiased select-none transition-all duration-700 flex items-center justify-center p-4 ${
        isStandalone 
          ? "bg-gradient-to-br from-[#0d0b14] via-[#130f22] to-[#08070d]" 
          : "bg-transparent"
      }`}
    >
      {/* Éléments globaux */}
      <Notification notification={player.notification} />
      <StarToggle menuOpen={menuOpen} panelOpen={menuOpen || repeatMenuOpen} toggleMenu={toggleFavoritesMenu} />
      <RepeatToggle menuOpen={repeatMenuOpen} panelOpen={menuOpen || repeatMenuOpen} toggleMenu={toggleRepeatMenu} />
      
      <FavoritesMenu
        isOpen={menuOpen}
        favorites={player.favorites}
        folderFavorites={player.folderFavorites}
        audioList={player.audioList}
        playTrack={player.playTrack}
        playTrackLoop={player.playTrackLoop}
        playAudio={player.playAudio}
        repeatDelays={player.repeatDelays}
        activeLoops={player.activeLoops}
        formatRepeatDelay={player.formatRepeatDelay}
        openRepeatDelayEditor={openRepeatDelayEditor}
        toggleFavorite={player.toggleFavorite}
        toggleFolderFavorite={player.toggleFolderFavorite}
        toggleMenu={toggleFavoritesMenu}
        changeFolder={player.changeFolder}
      />

      <RepeatMenu
        isOpen={repeatMenuOpen}
        audioList={player.audioList}
        playTrack={player.playTrack}
        playTrackLoop={player.playTrackLoop}
        playAudio={player.playAudio}
        repeatDelays={player.repeatDelays}
        activeLoops={player.activeLoops}
        formatRepeatDelay={player.formatRepeatDelay}
        openRepeatDelayEditor={openRepeatDelayEditor}
        toggleMenu={toggleRepeatMenu}
      />
  
      {/* Panneau Principal en Glassmorphism */}
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex flex-col items-center space-y-6 transition-all duration-300 hover:border-purple-500/20">
        
        <Header />

        {/* Message d'info si l'application est ouverte seule sur Vercel */}
        {isStandalone && (
          <div className="w-full max-w-[380px] bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 flex gap-2.5 items-start text-left text-xs text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.05)]">
            <Info size={16} className="shrink-0 mt-0.5 text-purple-400" />
            <div>
              <span className="font-bold block mb-0.5">Mode Extension Détecté</span>
              Pour profiter pleinement de la synchronisation audio en temps réel avec vos joueurs, intégrez l'URL de ce site directement comme extension dans votre salle **Owlbear Rodeo**.
            </div>
          </div>
        )}

        {!player.audioUnlocked && (
          <Button
            icon={Volume2}
            variant="toggle"
            size="sm"
            onClick={player.unlockAudio}
            className="w-full max-w-[380px] text-emerald-200"
          >
            Activer l'audio sur cet appareil
          </Button>
        )}
  
        {player.loading ? (
          <div className="w-full flex flex-col items-center space-y-5 py-12">
            <div className="flex flex-col items-center animate-pulse space-y-3">
              <div className="w-12 h-12 rounded-full border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
              <p className="text-xs text-purple-400 font-semibold tracking-wide uppercase">Chargement des fichiers...</p>
            </div>
            <TerminalLog entries={player.eventLog} />
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-5 flex flex-col items-center">
            
            {player.dbError && (
              <p className="w-full max-w-[380px] text-center text-xs text-red-300 font-medium bg-red-950/40 px-3 py-2 rounded-xl border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                ⚠️ Synchronisation des sons interrompue.
              </p>
            )}

            {player.roomId && (
              <div className="w-full max-w-[380px] rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  <span>Quota room</span>
                  <span className={quotaFull ? "text-red-300" : "text-white/45"}>
                    {quota ? `${formatBytes(quota.usedBytes)} / ${formatBytes(quota.limits.storageBytes)}` : "Chargement"}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${quotaFull ? "bg-red-400" : "bg-emerald-400"}`}
                    style={{ width: `${quotaPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-[10px] text-white/35">
                  <span>{quota ? `${quota.fileCount} / ${quota.limits.maxFiles} fichiers` : "Liste en cours"}</span>
                  <span>{quota ? `Max ${formatBytes(quota.limits.maxUploadBytes)} par fichier` : "..."}</span>
                </div>
              </div>
            )}

            <label className="w-full max-w-[380px] flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-snug text-amber-100/75">
              <input
                type="checkbox"
                checked={player.rightsConfirmed}
                onChange={(event) => player.setRightsConfirmed(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-300"
              />
              <span>Je confirme être autorisé à ajouter ou modifier les sons de cette room.</span>
            </label>

            {turnstileSiteKey && (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onTokenChange={handleTurnstileToken}
                resetKey={turnstileResetKey}
              />
            )}

            {securityMisconfigured && (
              <p className="w-full max-w-[380px] rounded-xl border border-red-400/25 bg-red-400/[0.05] px-3 py-2 text-center text-[10px] text-red-200">
                Protection anti-robot requise, mais la clé publique manque dans le frontend.
              </p>
            )}

            {uploadsPaused && (
              <p className="w-full max-w-[380px] rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-center text-[10px] text-amber-100/75">
                Les nouveaux uploads sont temporairement suspendus. Les sons existants restent disponibles.
              </p>
            )}

            {/* Zone de Téléversement Stylisée */}
            <label className={`w-full max-w-[380px] h-11 flex items-center justify-center gap-2 border rounded-xl group transition-all duration-300 ${
              quotaFull
                ? "cursor-not-allowed border-red-400/25 bg-red-400/[0.04] hover:border-red-400/40"
                : player.rightsConfirmed
                  ? "cursor-pointer border-white/10 hover:border-purple-500/40 bg-white/[0.03] hover:bg-purple-500/[0.06] hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                  : "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-60"
            }`}>
              {player.isUploading ? (
                <>
                  <Loader2 className="animate-spin text-purple-400" size={16} />
                  <span className="text-xs font-semibold text-purple-300">Téléversement en cours...</span>
                </>
              ) : uploadsPaused ? (
                <>
                  <Upload className="text-amber-300/70" size={15} />
                  <span className="text-xs font-medium text-amber-200/80">
                    Uploads suspendus
                  </span>
                </>
              ) : quotaFull ? (
                <>
                  <Upload className="text-red-300/70" size={15} />
                  <span className="text-xs font-medium text-red-200/80">
                    Quota atteint
                  </span>
                </>
              ) : !player.rightsConfirmed ? (
                <>
                  <Upload className="text-white/30" size={15} />
                  <span className="text-xs font-medium text-white/45">
                    Confirmez avant l'upload
                  </span>
                </>
              ) : !challengeReady ? (
                <>
                  <Loader2 className="animate-spin text-sky-300" size={15} />
                  <span className="text-xs font-medium text-sky-200/70">
                    Vérification en cours
                  </span>
                </>
              ) : (
                <>
                  <Upload className="text-white/40 group-hover:text-purple-400 group-hover:scale-110 transition-all" size={15} />
                  <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">
                    Ajouter un fichier audio
                  </span>
                </>
              )}
              <input 
                type="file" 
                accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm,.mp3,.wav,.ogg,.opus,.m4a,.aac,.flac,.webm" 
                className="hidden" 
                onChange={player.handleFileUpload} 
                disabled={player.isUploading || !player.rightsConfirmed || !challengeReady || securityMisconfigured || quotaFull}
              />
            </label>

            {folderFormOpen ? (
              <form
                onSubmit={handleCreateFolderSubmit}
                className="w-full max-w-[380px] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  disabled={player.isCreatingFolder || !player.rightsConfirmed || !challengeReady || uploadsPaused}
                  placeholder="Nom du dossier"
                  className="min-w-0 flex-1 h-10 rounded-xl bg-white/[0.03] border border-white/10 px-3 text-xs text-white/80 placeholder:text-white/25 outline-none focus:border-amber-400/50 focus:bg-amber-400/[0.04]"
                  autoFocus
                />
                <Button
                  icon={Check}
                  type="submit"
                  disabled={player.isCreatingFolder || !player.rightsConfirmed || !challengeReady || securityMisconfigured || uploadsPaused}
                  loading={player.isCreatingFolder}
                  variant="toggle"
                  size="icon"
                  className="text-amber-300"
                  title="Créer le dossier"
                />
                <Button
                  icon={X}
                  type="button"
                  onClick={() => { setFolderFormOpen(false); setFolderName(""); }}
                  disabled={player.isCreatingFolder}
                  variant="ghost"
                  size="icon"
                  className="text-white/40 hover:text-white"
                  title="Annuler"
                />
              </form>
            ) : (
              <Button
                icon={FolderPlus}
                variant="secondary"
                size="sm"
                onClick={() => setFolderFormOpen(true)}
                disabled={!player.rightsConfirmed || !challengeReady || securityMisconfigured || uploadsPaused}
                className="w-full max-w-[380px] hover:text-amber-200"
              >
                Ajouter un dossier
              </Button>
            )}

            {repeatEditorTrack && (
              <form
                onSubmit={handleRepeatDelaySubmit}
                className="w-full max-w-[380px] rounded-xl bg-emerald-400/[0.04] border border-emerald-400/20 p-3 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2 text-emerald-200">
                    <Clock3 size={15} className="shrink-0" />
                    <span className="truncate text-xs font-semibold">
                      {repeatEditorTrack.name?.replace(/\.(mp3|wav)$/i, "") || "Répétition"}
                    </span>
                  </div>
                  <Button
                    icon={X}
                    type="button"
                    onClick={() => setRepeatEditorTrack(null)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/35 hover:text-white"
                    title="Fermer"
                  />
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                  <label className="min-w-0 flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-white/35">Min</span>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={repeatMinutes}
                      onChange={(e) => setRepeatMinutes(e.target.value)}
                      className="h-9 rounded-lg bg-black/20 border border-white/10 px-2 text-xs text-white/80 outline-none focus:border-emerald-300/50"
                    />
                  </label>
                  <label className="min-w-0 flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-white/35">Sec</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={repeatSeconds}
                      onChange={(e) => setRepeatSeconds(e.target.value)}
                      className="h-9 rounded-lg bg-black/20 border border-white/10 px-2 text-xs text-white/80 outline-none focus:border-emerald-300/50"
                    />
                  </label>
                  <Button
                    icon={Check}
                    type="submit"
                    variant="toggle"
                    size="icon"
                    className="h-9 w-9 text-emerald-200"
                    title="Sauvegarder"
                  />
                  <Button
                    icon={RotateCcw}
                    type="button"
                    onClick={handleRepeatDelayReset}
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white/40 hover:text-white"
                    title="Remettre à immédiat"
                  />
                </div>
              </form>
            )}
  
            {/* Sélecteur de fichiers */}
            <AudioSelector
              audioUrl={player.audioUrl}
              setAudioUrl={player.setAudioUrl}
              audioList={player.audioList}
              playTrack={player.playTrack}
              playTrackLoop={player.playTrackLoop}
              playAudio={player.playAudio}
              repeatDelays={player.repeatDelays}
              activeLoops={player.activeLoops}
              formatRepeatDelay={player.formatRepeatDelay}
              openRepeatDelayEditor={openRepeatDelayEditor}
              favorites={player.favorites}
              toggleFavorite={player.toggleFavorite}
              currentPath={player.currentPath}
              changeFolder={player.changeFolder}
              goBack={player.goBack}
              folderFavorites={player.folderFavorites}
              toggleFolderFavorite={player.toggleFolderFavorite}
              handleDeleteTrack={player.handleDeleteTrack}
              deletingPath={player.deletingPath}
              modificationsDisabled={!player.rightsConfirmed || !challengeReady || securityMisconfigured}
            />
  
            {/* Contrôles du Volume & Mute */}
            <AudioControls
              isMuted={player.isMuted}
              toggleMute={player.toggleMute}
              volume={player.volume}
              handleVolumeChange={player.handleVolumeChange}
              stopAllSounds={player.stopAllSounds}
              audiosCount={player.activeSoundsCount}
            />

            <TerminalLog entries={player.eventLog} />
  
            <HelpSection helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
          </div>
        )}
      </div>
    </div>
  );
}
