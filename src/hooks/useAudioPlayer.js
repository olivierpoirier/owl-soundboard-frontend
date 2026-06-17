import { useState, useEffect, useRef, useCallback } from "react";
import OBR from "@owlbear-rodeo/sdk";

export function useAudioPlayer(apiUrl) {
  const audiosRef = useRef([]);
  const volumeRef = useRef(1);
  const mutedRef = useRef(false);
  const notificationTimeoutRef = useRef(null); // Fix de la superposition des timeouts

  const [currentPath, setCurrentPath] = useState("/owlbear");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioList, setAudioList] = useState([]);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [activeSoundsCount, setActiveSoundsCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Initialisation synchrone des états depuis le localStorage (Évite le flash/re-render)
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("owlbear_volume");
    return saved !== null ? parseFloat(saved) : 1;
  });
  
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem("owlbear_isMuted") === "true";
  });

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("owlbear_favorites");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [folderFavorites, setFolderFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("owlbear_folder_favorites");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Synchronisation des refs
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);

  // Nettoyage global des pistes audio si le composant est démonté
  useEffect(() => {
    return () => {
      audiosRef.current.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, []);

  // Initialiser Owlbear Rodeo
  useEffect(() => {
    try {
      OBR.onReady(() => {
        setIsReady(true);
        OBR.broadcast.onMessage("mini-tracks-play", (event) => {
          const { url, senderName } = event.data;
          showNotification(`🔊 Son déclenché par ${senderName}`);
          playAudio(url);
        });
      });
    } catch (e) {
      console.warn("OBR non détecté (hors d'Owlbear Rodeo)", e);
    }
  }, []);

  const showNotification = (msg) => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setNotification(msg);
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 2500);
  };

  const fetchAudioList = useCallback(async (path) => {
    setLoading(true);
    setDbError(false);
    const targetPath = path && path !== "/" ? path : "/owlbear";
    setCurrentPath(targetPath);

    try {
      const res = await fetch(`${apiUrl}?path=${encodeURIComponent(targetPath)}`);
      if (!res.ok) throw new Error("Erreur serveur API");
      
      const data = await res.json();
      
      const folders = data?.filter(item => item.isFolder) || [];
      const files = data?.filter(item => !item.isFolder) || [];

      const fixedFiles = files.map(file => ({
        name: file.name,
        url: file.url.replace(/([?&])dl=0(&|$)/, "$1raw=1$2"),
        isFolder: false,
        path: file.path,
      }));

      setAudioList([...folders, ...fixedFiles]);
      if (fixedFiles.length > 0) setAudioUrl(fixedFiles[0].url);
    } catch (error) {
      console.error("Erreur lors de la récupération des audios:", error);
      setDbError(true);
      setAudioList([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchAudioList("/owlbear");
  }, [fetchAudioList]);

  const playAudio = (url) => {
    try {
      const audio = new Audio(url);
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      
      audio.play()
        .then(() => {
          audiosRef.current.push(audio);
          setActiveSoundsCount(audiosRef.current.length);
        })
        .catch(e => console.warn("Lecture audio bloquée par le navigateur :", e));

      audio.addEventListener("ended", () => {
        audiosRef.current = audiosRef.current.filter((a) => a !== audio);
        setActiveSoundsCount(audiosRef.current.length);
      });
    } catch (e) {
      console.error("Impossible de créer l'instance Audio :", e);
    }
  };

  const playTrack = (url) => {
    if (!isReady) {
      playAudio(url);
      return;
    }
    OBR.player.getName().then((playerName) => {
      OBR.broadcast.sendMessage("mini-tracks-play", { url, senderName: playerName || "MJ" });
    });
    playAudio(url);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".mp3") && !file.name.endsWith(".wav")) {
      showNotification("⚠️ Format invalide (.mp3 ou .wav uniquement)");
      return;
    }

    // Réduction à 3.1 Mo max pour absorber l'excès de poids lié à la conversion Base64 (limite Vercel de 4.5Mo)
    if (file.size > 3.1 * 1024 * 1024) {
      showNotification("⚠️ Fichier trop lourd (Max ~3 Mo à cause des limites Vercel)");
      return;
    }

    setIsUploading(true);
    showNotification("⏳ Téléversement sur Dropbox...");

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Data = reader.result.split(",")[1];
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, fileData: base64Data, path: currentPath }),
        });
        const result = await response.json();
        if (result.success) {
          showNotification("✅ Son ajouté !");
          fetchAudioList(currentPath);
        } else {
          showNotification("❌ Échec de l'upload.");
        }
      } catch (err) {
        console.error(err);
        showNotification("❌ Erreur serveur.");
      } finally {
        setIsUploading(false);
        e.target.value = "";
      }
    };
  };

  const changeFolder = (path) => fetchAudioList(path);
  
  const goBack = () => {
    if (currentPath === "/owlbear") return;
    const pathParts = currentPath.split("/").filter(p => p.length > 0);
    pathParts.pop();
    const newPath = "/" + pathParts.join("/");
    fetchAudioList(newPath === "/" ? "/owlbear" : newPath);
  };

  const toggleFavorite = (url) => {
    const current = favorites || [];
    const updated = current.includes(url) ? current.filter(fav => fav !== url) : [...current, url];
    setFavorites(updated);
    localStorage.setItem("owlbear_favorites", JSON.stringify(updated));
  };

  const toggleFolderFavorite = (path) => {
    const current = folderFavorites || [];
    const updated = current.includes(path) ? current.filter(fav => fav !== path) : [...current, path];
    setFolderFavorites(updated);
    localStorage.setItem("owlbear_folder_favorites", JSON.stringify(updated));
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    localStorage.setItem("owlbear_volume", newVolume.toString());
    audiosRef.current.forEach(audio => audio.volume = mutedRef.current ? 0 : newVolume);
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStorage.setItem("owlbear_isMuted", newMuted.toString());
    audiosRef.current.forEach(audio => audio.volume = newMuted ? 0 : volumeRef.current);
  };

  const stopAllSounds = () => {
    audiosRef.current.forEach(audio => {
      audio.pause();
      audio.src = ""; // Force la libération de la mémoire de l'élément HTMLAudio
    });
    audiosRef.current = [];
    setActiveSoundsCount(0);
  };

  return {
    currentPath, folderFavorites, audioUrl, setAudioUrl, audioList, favorites,
    notification, loading, isUploading, dbError, volume, isMuted, activeSoundsCount,
    changeFolder, goBack, toggleFavorite, toggleFolderFavorite, playTrack, playAudio,
    handleFileUpload, handleVolumeChange, toggleMute, stopAllSounds
  };
}