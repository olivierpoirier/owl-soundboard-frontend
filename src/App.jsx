import React, { useState, useEffect } from "react";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import Notification from "./components/Notification";
import Header from "./components/Header";
import AudioControls from "./components/AudioControls";
import AudioSelector from "./components/AudioSelector";
import HelpSection from "./components/HelpSection";
import FavoritesMenu from "./components/FavoritesMenu";
import StarToggle from "./components/StarToggle";
import { Upload, Loader2, Info } from "lucide-react";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  
  const apiUrl = "https://owl-soundboard-backend.vercel.app/api/dropbox-files";
  const player = useAudioPlayer(apiUrl);

  // Détecter si l'application est ouverte dans une iframe (Owlbear Rodeo) ou seule
  useEffect(() => {
    if (window.self !== window.top) {
      setIsStandalone(false); // On est dans Owlbear Rodeo !
    } else {
      setIsStandalone(true);  // On est seul sur Vercel ou localhost
    }
  }, []);

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
      <StarToggle menuOpen={menuOpen} toggleMenu={() => setMenuOpen(!menuOpen)} />
      
      <FavoritesMenu
        isOpen={menuOpen}
        favorites={player.favorites}
        folderFavorites={player.folderFavorites}
        audioList={player.audioList}
        playTrack={player.playTrack}
        playAudio={player.playAudio}
        toggleFavorite={player.toggleFavorite}
        toggleFolderFavorite={player.toggleFolderFavorite}
        toggleMenu={() => setMenuOpen(!menuOpen)}
        changeFolder={player.changeFolder}
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
  
        {player.loading ? (
          <div className="flex flex-col items-center animate-pulse space-y-3 py-12">
            <div className="w-12 h-12 rounded-full border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
            <p className="text-xs text-purple-400 font-semibold tracking-wide uppercase">Chargement des fichiers...</p>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-5 flex flex-col items-center">
            
            {player.dbError && (
              <p className="w-full max-w-[380px] text-center text-xs text-red-300 font-medium bg-red-950/40 px-3 py-2 rounded-xl border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                ⚠️ Synchronisation Dropbox interrompue (En attente du déploiement backend).
              </p>
            )}

            {/* Zone de Téléversement Stylisée */}
            <label className="w-full max-w-[380px] h-11 flex items-center justify-center gap-2 border border-white/10 hover:border-purple-500/40 bg-white/[0.03] hover:bg-purple-500/[0.06] rounded-xl cursor-pointer group transition-all duration-300 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]">
              {player.isUploading ? (
                <>
                  <Loader2 className="animate-spin text-purple-400" size={16} />
                  <span className="text-xs font-semibold text-purple-300">Téléversement en cours...</span>
                </>
              ) : (
                <>
                  <Upload className="text-white/40 group-hover:text-purple-400 group-hover:scale-110 transition-all" size={15} />
                  <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">
                    Ajouter un fichier audio (.mp3, .wav)
                  </span>
                </>
              )}
              <input 
                type="file" 
                accept="audio/mp3, audio/wav, audio/mpeg" 
                className="hidden" 
                onChange={player.handleFileUpload} 
                disabled={player.isUploading}
              />
            </label>
  
            {/* Sélecteur de fichiers */}
            <AudioSelector
              audioUrl={player.audioUrl}
              setAudioUrl={player.setAudioUrl}
              audioList={player.audioList}
              playTrack={player.playTrack}
              playAudio={player.playAudio}
              favorites={player.favorites}
              toggleFavorite={player.toggleFavorite}
              currentPath={player.currentPath}
              changeFolder={player.changeFolder}
              goBack={player.goBack}
              folderFavorites={player.folderFavorites}
              toggleFolderFavorite={player.toggleFolderFavorite}
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
  
            <HelpSection helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
          </div>
        )}
      </div>
    </div>
  );
}