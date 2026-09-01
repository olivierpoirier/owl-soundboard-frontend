import { useEffect, useState } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Star, 
  Music,
  Folder, 
  FolderOpen,
  ArrowLeft,
  Trash2
} from "lucide-react";
import Button from "./Button";
import TrackActionButtons from "./TrackActionButtons";

export default function AudioSelector({ 
  audioList, playTrack, playTrackLoop, playAudio, favorites, toggleFavorite, 
  currentPath, changeFolder, goBack, folderFavorites, toggleFolderFavorite,
  repeatDelays, activeLoops, formatRepeatDelay, openRepeatDelayEditor,
  handleDeleteTrack, deletingPath, modificationsDisabled = false
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

  useEffect(() => {
    if (page > maxPage && totalItems > 0) {
      setPage(maxPage);
    } else if (totalItems === 0 && page !== 0) {
      setPage(0);
    }
  }, [maxPage, page, totalItems]);

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
        {currentPath !== "/" ? (
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
          const trackKey = file.id || file.path || file.url;
          const repeatDelay = !file.isFolder ? Number(repeatDelays?.[trackKey]) || 0 : 0;
          const repeatActive = !file.isFolder && Boolean(activeLoops?.[trackKey]);
          const isDeleting = deletingPath === file.path;
          const displayName = file.name.replace(/\.(mp3|wav|ogg|opus|m4a|aac|flac|webm)$/i, "");

          return (
            <div
              key={file.path || file.url}
              onClick={() => file.isFolder ? changeFolder(file.path) : playTrack(file.url, displayName)}
              className={`relative h-[150px] min-h-0 bg-white/[0.02] border rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all duration-300 group hover:-translate-y-0.5 ${
                file.isFolder
                  ? "cursor-pointer border-white/10 hover:bg-purple-500/[0.04] hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                  : repeatActive
                    ? "cursor-pointer overflow-hidden border-emerald-400/40 bg-emerald-400/[0.04] shadow-[0_0_18px_rgba(52,211,153,0.08)]"
                    : "cursor-pointer overflow-hidden border-white/10 hover:border-white/20"
              }`}
              title={file.isFolder ? "Ouvrir le dossier" : "Jouer pour tout le monde"}
            >
              {file.isFolder ? (
                <>
                  <FolderOpen size={28} className="text-amber-400/80 mb-2 group-hover:scale-110 transition-transform duration-300 group-hover:text-amber-400" />
                  <div className="text-xs font-medium text-white/70 group-hover:text-white truncate w-full max-w-[120px] transition-colors">
                    {displayName}
                  </div>

                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                    <Button
                      icon={Star}
                      size="icon"
                      variant="ghost"
                      active={isFav}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        toggleFolderFavorite(file.path); 
                      }}
                      className={`h-8 w-8 ${
                        isFav ? "text-amber-400 [&>svg]:fill-current" : "text-white/35 hover:text-amber-300"
                      }`}
                      title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                    />
                  </div>
                </>
              ) : (
                <>
                  {repeatDelay > 0 && (
                    <span className="absolute top-2 left-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-200">
                      {formatRepeatDelay(repeatDelay)}
                    </span>
                  )}

                  {handleDeleteTrack && (
                    <Button
                      icon={Trash2}
                      size="icon"
                      variant="ghost"
                      loading={isDeleting}
                      disabled={modificationsDisabled || isDeleting}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteTrack(file);
                      }}
                      className="absolute top-2 right-2 h-8 w-8 text-white/25 hover:text-red-300 hover:border-red-400/30 hover:bg-red-400/[0.05]"
                      title="Supprimer de la room"
                    />
                  )}

                  <Music
                    size={30}
                    className={`mb-2 transition-all duration-300 group-hover:scale-110 ${
                      repeatActive ? "text-emerald-300" : "text-purple-300/80 group-hover:text-purple-300"
                    }`}
                  />

                  <div className="w-full max-w-[120px] truncate text-xs font-semibold text-white/75 transition-colors group-hover:text-white">
                    {displayName}
                  </div>

                  <TrackActionButtons
                    actions={["play", "delay", "repeat", "favorite", "solo"]}
                    file={file}
                    displayName={displayName}
                    trackKey={trackKey}
                    playTrack={playTrack}
                    playTrackLoop={playTrackLoop}
                    playAudio={playAudio}
                    repeatDelay={repeatDelay}
                    repeatActive={repeatActive}
                    formatRepeatDelay={formatRepeatDelay}
                    openRepeatDelayEditor={openRepeatDelayEditor}
                    favoriteActive={isFav}
                    toggleFavorite={toggleFavorite}
                    className="absolute bottom-2 left-1/2 w-[164px] -translate-x-1/2 gap-1"
                    buttonClassName="h-8 w-8"
                  />
                </>
              )}
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
