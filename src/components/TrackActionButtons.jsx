import { Clock3, Headphones, Repeat2, Star, Volume2 } from "lucide-react";
import Button from "./Button";

const columnClasses = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

function handleActionClick(event, action) {
  event.stopPropagation();
  action?.();
}

export default function TrackActionButtons({
  actions = ["play", "delay", "repeat", "solo"],
  file,
  displayName,
  trackKey,
  playTrack,
  playTrackLoop,
  playAudio,
  repeatDelay = 0,
  repeatActive = false,
  formatRepeatDelay,
  openRepeatDelayEditor,
  afterDelayClick,
  favoriteActive = false,
  toggleFavorite,
  className = "",
  buttonClassName = "h-7 w-7",
}) {
  const formattedDelay = formatRepeatDelay?.(repeatDelay) || "immédiat";

  const configs = {
    play: {
      icon: Volume2,
      variant: "ghost",
      onClick: () => playTrack?.(file.url, displayName),
      className: "text-white/30 hover:text-purple-300",
      title: "Jouer pour tous",
    },
    delay: {
      icon: Clock3,
      variant: "toggle",
      active: repeatDelay > 0,
      onClick: () => {
        openRepeatDelayEditor?.(file);
        afterDelayClick?.();
      },
      className: repeatDelay > 0 ? "text-emerald-200" : "text-white/30 hover:text-emerald-300",
      title: repeatDelay > 0 ? `Délai: ${formattedDelay}` : "Régler le délai",
    },
    repeat: {
      icon: Repeat2,
      variant: "toggle",
      active: repeatActive,
      onClick: () => playTrackLoop?.(file.url, trackKey, displayName),
      className: repeatActive ? "text-emerald-300" : "text-white/30 hover:text-emerald-300",
      title: repeatActive ? "Arrêter cette boucle" : repeatDelay > 0 ? `Répéter après ${formattedDelay}` : "Boucle pour tous",
    },
    solo: {
      icon: Headphones,
      variant: "ghost",
      onClick: () => playAudio?.(file.url),
      className: "text-white/30 hover:text-purple-300",
      title: "Solo",
    },
    favorite: {
      icon: Star,
      variant: "ghost",
      active: favoriteActive,
      onClick: () => toggleFavorite?.(file.url),
      className: favoriteActive ? "text-amber-400 [&>svg]:fill-current" : "text-white/35 hover:text-amber-300",
      title: favoriteActive ? "Retirer des favoris" : "Ajouter aux favoris",
    },
  };

  return (
    <div className={`grid ${columnClasses[actions.length] || "grid-flow-col"} items-center gap-1 shrink-0 ${className}`}>
      {actions.map((actionName) => {
        const config = configs[actionName];
        if (!config) return null;

        return (
          <Button
            key={actionName}
            icon={config.icon}
            size="icon"
            variant={config.variant}
            active={config.active}
            onClick={(event) => handleActionClick(event, config.onClick)}
            className={`${buttonClassName} justify-self-center ${config.className}`}
            title={config.title}
          />
        );
      })}
    </div>
  );
}
