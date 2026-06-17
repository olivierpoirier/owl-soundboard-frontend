import { useState } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Volume2, 
  Star, 
  Headphones, 
  Folder, 
  FolderOpen,
  ArrowLeft 
} from "lucide-react";

export default function AudioSelector({ 
  audioList, playTrack, playAudio, favorites, toggleFavorite, 
  currentPath, changeFolder, goBack, folderFavorites, toggleFolderFavorite 
}) {
  const itemsPerPage = 6;
  const [page, setPage] = useState(0);
  
  const totalItems = audioList?.length || 0; 
  const maxPage = Math.ceil(totalItems / itemsPerPage) - 1;

  const goToPage = (newPage) => {
    if (maxPage < 0) return;
    let next = newPage;
    if (next < 0) next = maxPage;
    else if (next > maxPage) next = 0;
    setPage(next);
  };

  if (page > maxPage && totalItems > 0) setPage(maxPage);
  else if (totalItems === 0 && page !== 0) setPage(0);

  const pageItems = audioList?.slice(page * itemsPerPage, (page + 1) * itemsPerPage) || [];
  const showPagination = totalItems > itemsPerPage;

  // Calcul intelligent des pages à afficher (Max 5 pages pour éviter le débordement)
  const getVisiblePages = () => {
    let start = Math.max(0, page - 2);
    let end = Math.min(maxPage, page + 2);

    if (page - 2 < 0) {
      end = Math.min(maxPage, end + (2 - page));
    }
    if (page + 2 > maxPage) {
      start = Math.max(0, start - (page + 2 - maxPage));
    }

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[380px]">
      
      {/* Fil d'Ariane / Chemin */}
      <div className="flex items-center justify-between w-full h-10 px-3 bg-white/[0.02] border border-white/5 rounded-xl">
        {currentPath !== "/owlbear" ? (
          <button 
            onClick={goBack} 
            className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors text-xs font-semibold"
          >
            <ArrowLeft size={14} />
            Retour
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-white/40 text-xs font-semibold tracking-wide uppercase">
            <Folder size={14} />
            <span>Racine</span>
          </div>
        )}
        <span className="text-[10px] text-white/30 truncate max-w-[180px] font-mono">{currentPath}</span>
      </div>

      {/* Grille */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {pageItems.map((file) => {
          const isFolderFav = file.isFolder && folderFavorites?.includes(file.path);
          const isTrackFav = !file.isFolder && favorites?.includes(file.url);
          const isFav = isFolderFav || isTrackFav;

          return (
            <div
              key={file.path || file.url}
              onClick={() => file.isFolder ? changeFolder(file.path) : playTrack(file.url)}
              className="relative aspect-[4/3] bg-white/[0.02] border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group hover:bg-purple-500/[0.04] hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] hover:-translate-y-0.5"
            >
              {/* Étoile Favori */}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  file.isFolder ? toggleFolderFavorite(file.path) : toggleFavorite(file.url); 
                }}
                className={`absolute top-2 right-2 transition-all duration-200 ${
                  isFav ? "text-amber-400 opacity-100" : "text-white/20 opacity-0 group-hover:opacity-100 hover:text-white/60"
                }`}
              >
                <Star size={14} className={isFav ? "fill-current" : ""} />
              </button>

              {/* Mode Solo (uniquement pour les fichiers) */}
              {!file.isFolder && (
                <button 
                  onClick={(e) => { e.stopPropagation(); playAudio(file.url); }}
                  className="absolute bottom-2 right-2 text-white/20 opacity-0 group-hover:opacity-100 hover:text-purple-400 transition-all duration-200"
                  title="Écouter en solo"
                >
                  <Headphones size={14} />
                </button>
              )}

              {/* Icône principale */}
              {file.isFolder ? (
                <FolderOpen size={28} className="text-amber-400/80 mb-2 group-hover:scale-110 transition-transform duration-300 group-hover:text-amber-400" />
              ) : (
                <Volume2 size={28} className="text-purple-400/80 mb-2 group-hover:scale-110 transition-transform duration-300 group-hover:text-purple-400" />
              )}
              
              <div className="text-xs font-medium text-white/70 group-hover:text-white truncate w-full max-w-[120px] transition-colors">
                {file.name.replace(/\.(mp3|wav)$/i, "")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Fixée */}
      {showPagination && (
        <div className="flex gap-1 items-center justify-center mt-1 w-full">
          <button onClick={() => goToPage(page - 1)} className="text-white/40 hover:text-purple-400 p-1.5 transition-colors">
            <ChevronLeft size={18} />
          </button>
          
          {visiblePages.map((i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`text-[11px] font-bold rounded-lg transition-all duration-200 w-7 h-7 flex items-center justify-center border ${
                i === page 
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-extrabold shadow-[0_0_10px_rgba(168,85,247,0.15)]' 
                  : 'text-white/40 border-transparent hover:bg-white/5 hover:text-white/70'
              }`}
            >
              {i + 1}
            </button>
          ))}
          
          <button onClick={() => goToPage(page + 1)} className="text-white/40 hover:text-purple-400 p-1.5 transition-colors">
            <ChevronRight size={18} />
          </button>

          {/* Petit indicateur du total de pages */}
          <span className="text-[10px] text-white/20 font-medium ml-2 select-none">
            / {maxPage + 1}
          </span>
        </div>
      )}
    </div>
  );
}