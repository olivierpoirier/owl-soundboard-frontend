import { motion } from "framer-motion";
import { Star, Volume2, Headphones, FolderOpen, X } from "lucide-react";

export default function FavoritesMenu({ 
  isOpen, favorites, folderFavorites, audioList, playTrack, playAudio, toggleFavorite, toggleFolderFavorite, toggleMenu, changeFolder
}) {
  const favoriteFiles = favorites?.map((url) => audioList?.find((f) => f.url === url)).filter(Boolean) || [];

  return (
    <motion.div
      initial={{ x: -340 }}
      animate={{ x: isOpen ? 0 : -340 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      // Largeur passée à w-[320px] pour donner de l'espace aux textes et icônes
      className="fixed top-0 left-0 h-full w-[320px] bg-[#0d0b14]/90 backdrop-blur-xl border-r border-white/10 p-5 z-50 flex flex-col gap-5 overflow-y-auto shadow-[5px_0_30px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Star size={14} className="fill-current" />
          <span>Favoris</span>
        </div>
        <button onClick={toggleMenu} className="text-white/40 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Catégorie Dossiers */}
      <div className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider font-bold text-white/30">Dossiers</h3>
        {folderFavorites?.length === 0 && (
          <span className="text-xs text-white/30 block italic pl-1">Aucun sous-dossier</span>
        )}
        <div className="grid grid-cols-1 gap-2">
          {folderFavorites?.map((favPath) => {
            const folderName = favPath?.split("/").filter(Boolean).pop() || "Racine";
            return (
              <div
                key={favPath}
                onClick={() => { changeFolder(favPath); toggleMenu(); }}
                className="group flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg p-2.5 text-xs cursor-pointer hover:border-amber-500/30 hover:bg-amber-500/[0.02] transition-all"
              >
                <div className="flex items-center gap-2 truncate text-white/70 group-hover:text-white max-w-[80%]">
                  <FolderOpen size={14} className="text-amber-400 shrink-0" />
                  <span className="truncate">{folderName}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleFolderFavorite(favPath); }}
                  className="text-amber-400 opacity-60 hover:opacity-100 p-1"
                >
                  <Star size={12} className="fill-current" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Catégorie Sons */}
      <div className="space-y-2 flex-1">
        <h3 className="text-[10px] uppercase tracking-wider font-bold text-white/30">Pistes Audio</h3>
        {favoriteFiles.length === 0 && (
          <span className="text-xs text-white/30 block italic pl-1">Aucune piste favorie</span>
        )}
        <div className="flex flex-col gap-2">
          {favoriteFiles.map((file) => (
            <div
              key={file.name}
              onClick={() => playTrack(file.url)}
              className="group relative flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg p-2.5 text-xs cursor-pointer hover:border-purple-500/30 hover:bg-purple-500/[0.02] transition-all"
            >
              {/* Augmentation du max-w à 75% pour que le titre respire */}
              <div className="flex items-center gap-2 truncate text-white/70 group-hover:text-white max-w-[75%]">
                <Volume2 size={14} className="text-purple-400 shrink-0" />
                <span className="truncate">{file.name.replace(/\.(mp3|wav)$/i, "")}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={(e) => { e.stopPropagation(); playAudio(file.url); }}
                  className="text-white/30 hover:text-purple-400 p-1 transition-colors"
                  title="Solo"
                >
                  <Headphones size={13} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(file.url); }}
                  className="text-amber-400 p-1 transition-colors"
                >
                  <Star size={13} className="fill-current" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}