import { useState, useEffect, useRef, useCallback } from "react";
import OBR from "@owlbear-rodeo/sdk";

const ROOT_PATH = "/owlbear";
const ROOM_LOOPS_KEY = "owlbear.soundboard.activeLoops";

function clampDelay(seconds) {
  return Math.max(0, Math.min(24 * 60 * 60, Number(seconds) || 0));
}

function getLoopsFromMetadata(metadata) {
  const state = metadata?.[ROOM_LOOPS_KEY];
  if (!state || typeof state !== "object" || !state.loops || typeof state.loops !== "object") {
    return {};
  }
  return state.loops;
}

function getLoopSignature(loop) {
  return `${loop.url}|${loop.repeatDelaySeconds}|${loop.startedAt}`;
}

function normalizeAudioUrl(url) {
  return url.replace(/([?&])dl=0(&|$)/, "$1raw=1$2");
}

export function useAudioPlayer(apiUrl) {
  const oneShotAudiosRef = useRef([]);
  const loopPlayersRef = useRef(new Map());
  const volumeRef = useRef(1);
  const mutedRef = useRef(false);
  const notificationTimeoutRef = useRef(null);
  const obrUnsubscribesRef = useRef([]);
  const audioUnlockedRef = useRef(false);
  const persistentLoopsRef = useRef({});
  const resumePersistentLoopsRef = useRef(() => {});
  const mountedRef = useRef(true);

  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioList, setAudioList] = useState([]);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [activeSoundsCount, setActiveSoundsCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [activeLoops, setActiveLoops] = useState({});
  const [eventLog, setEventLog] = useState(() => [{
    id: "boot",
    time: new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    type: "system",
    message: "Terminal audio prêt.",
  }]);

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
    } catch {
      return [];
    }
  });

  const [folderFavorites, setFolderFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("owlbear_folder_favorites");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [repeatDelays, setRepeatDelays] = useState(() => {
    try {
      const saved = localStorage.getItem("owlbear_repeat_delays");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    audioUnlockedRef.current = audioUnlocked;
  }, [audioUnlocked]);

  const showNotification = useCallback((msg) => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setNotification(msg);
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 2500);
  }, []);

  const addLog = useCallback((type, message) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      type,
      message,
    };
    setEventLog((current) => [entry, ...current].slice(0, 60));
  }, []);

  const unlockAudio = useCallback(async () => {
    try {
      if (window.AudioContext || window.webkitAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
        window.setTimeout(() => audioContext.close?.(), 250);
      }

      const silentAudio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
      silentAudio.muted = true;
      await silentAudio.play();
      silentAudio.pause();
      silentAudio.src = "";
      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
      addLog("system", "Audio activé sur cet appareil.");
      showNotification("✅ Audio activé");
      resumePersistentLoopsRef.current();
      return true;
    } catch (error) {
      console.warn("Déverrouillage audio refusé par le navigateur :", error);
      setAudioUnlocked(false);
      return false;
    }
  }, [addLog, showNotification]);

  const formatRepeatDelay = useCallback((seconds) => {
    const totalSeconds = clampDelay(seconds);
    if (totalSeconds === 0) return "immédiat";
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    if (minutes > 0 && remainingSeconds > 0) return `${minutes}m ${remainingSeconds}s`;
    if (minutes > 0) return `${minutes}m`;
    return `${remainingSeconds}s`;
  }, []);

  const syncActiveSoundsCount = useCallback(() => {
    setActiveSoundsCount(oneShotAudiosRef.current.length + loopPlayersRef.current.size);
  }, []);

  const stopLoopInstance = useCallback((loopId) => {
    const player = loopPlayersRef.current.get(loopId);
    if (!player) return;

    if (player.timerId) {
      clearTimeout(player.timerId);
    }
    if (player.audio) {
      player.audio._owlbearStopped = true;
      player.audio.pause();
      player.audio.src = "";
    }
    if (player.probe) {
      player.probe.src = "";
    }

    loopPlayersRef.current.delete(loopId);
    syncActiveSoundsCount();
  }, [syncActiveSoundsCount]);

  const clearLocalSounds = useCallback(({ updateCount = true } = {}) => {
    oneShotAudiosRef.current.forEach((audio) => {
      audio._owlbearStopped = true;
      audio.pause();
      audio.src = "";
    });
    oneShotAudiosRef.current = [];

    loopPlayersRef.current.forEach((_, loopId) => stopLoopInstance(loopId));
    loopPlayersRef.current.clear();

    if (updateCount) {
      setActiveSoundsCount(0);
    }
  }, [stopLoopInstance]);

  const registerLoopPlayer = useCallback((loop, player) => {
    loopPlayersRef.current.set(loop.id, {
      ...player,
      signature: getLoopSignature(loop),
    });
    syncActiveSoundsCount();
  }, [syncActiveSoundsCount]);

  const startLoopInstance = useCallback((loop, { alignToStartedAt = false } = {}) => {
    if (!loop?.id || !loop.url) return;

    const signature = getLoopSignature(loop);
    const existing = loopPlayersRef.current.get(loop.id);
    if (existing?.signature === signature) return;

    stopLoopInstance(loop.id);

    const delay = clampDelay(loop.repeatDelaySeconds);
    const playFrom = (offsetSeconds = 0) => {
      if (!mountedRef.current) return;

      const audio = new Audio(loop.url);
      audio._owlbearStopped = false;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      audio.loop = delay === 0;

      if (offsetSeconds > 0) {
        audio.currentTime = offsetSeconds;
      }

      registerLoopPlayer(loop, { audio, timerId: null });

      audio.play()
        .then(() => setAudioUnlocked(true))
        .catch((error) => {
          console.warn("Lecture audio bloquée par le navigateur :", error);
          setAudioUnlocked(false);
          addLog("warn", "Lecture bloquée par le navigateur. Activation audio requise.");
          showNotification("⚠️ Audio bloqué: cliquez sur Activer l'audio");
        });

      audio.addEventListener("ended", () => {
        if (audio._owlbearStopped || delay === 0) return;

        const current = loopPlayersRef.current.get(loop.id);
        if (!current || current.audio !== audio) return;
        audio.src = "";

        const timerId = setTimeout(() => {
          const waiting = loopPlayersRef.current.get(loop.id);
          if (!waiting || waiting.timerId !== timerId) return;
          loopPlayersRef.current.delete(loop.id);
          playFrom(0);
        }, delay * 1000);

        registerLoopPlayer(loop, { audio: null, timerId });
      });
    };

    const scheduleAfter = (waitSeconds) => {
      const timerId = setTimeout(() => {
        const waiting = loopPlayersRef.current.get(loop.id);
        if (!waiting || waiting.timerId !== timerId) return;
        loopPlayersRef.current.delete(loop.id);
        playFrom(0);
      }, waitSeconds * 1000);

      registerLoopPlayer(loop, { audio: null, timerId });
    };

    if (!alignToStartedAt) {
      playFrom(0);
      return;
    }

    const probe = new Audio(loop.url);
    probe.preload = "metadata";
    registerLoopPlayer(loop, { audio: null, timerId: null, probe });
    probe.addEventListener("loadedmetadata", () => {
      const current = loopPlayersRef.current.get(loop.id);
      if (!current || current.signature !== signature || current.probe !== probe) return;

      const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
      if (duration === 0) {
        playFrom(0);
        return;
      }

      const elapsed = Math.max(0, (Date.now() - Number(loop.startedAt || Date.now())) / 1000);
      const cycleLength = duration + delay;
      const phase = cycleLength > 0 ? elapsed % cycleLength : 0;

      if (phase < duration) {
        playFrom(Math.min(phase, Math.max(0, duration - 0.05)));
      } else {
        scheduleAfter(cycleLength - phase);
      }
    });
    probe.addEventListener("error", () => {
      const current = loopPlayersRef.current.get(loop.id);
      if (!current || current.signature !== signature || current.probe !== probe) return;
      playFrom(0);
    });
  }, [addLog, registerLoopPlayer, showNotification, stopLoopInstance]);

  const syncPersistentLoops = useCallback((loops, { alignToStartedAt = true } = {}) => {
    const previousLoops = persistentLoopsRef.current || {};
    const nextLoops = loops || {};
    persistentLoopsRef.current = nextLoops;
    setActiveLoops(nextLoops);

    Object.values(nextLoops).forEach((loop) => {
      if (!previousLoops[loop.id]) {
        addLog("loop", `${loop.senderName || "MJ"} a activé la boucle: ${loop.name || "son"} (${formatRepeatDelay(loop.repeatDelaySeconds)}).`);
      }
    });
    Object.values(previousLoops).forEach((loop) => {
      if (!nextLoops[loop.id]) {
        addLog("stop", `Boucle arrêtée: ${loop.name || "son"}.`);
      }
    });

    const loopEntries = Object.values(nextLoops).filter((loop) => loop?.id && loop?.url);
    const activeIds = new Set(loopEntries.map((loop) => loop.id));

    loopPlayersRef.current.forEach((_, loopId) => {
      if (!activeIds.has(loopId)) {
        stopLoopInstance(loopId);
      }
    });

    if (!audioUnlockedRef.current) return;

    loopEntries.forEach((loop) => startLoopInstance(loop, { alignToStartedAt }));
  }, [addLog, formatRepeatDelay, startLoopInstance, stopLoopInstance]);

  useEffect(() => {
    resumePersistentLoopsRef.current = () => {
      syncPersistentLoops(persistentLoopsRef.current, { alignToStartedAt: true });
    };
  }, [syncPersistentLoops]);

  const persistLoop = useCallback(async (loop) => {
    const metadata = await OBR.room.getMetadata();
    const loops = getLoopsFromMetadata(metadata);
    await OBR.room.setMetadata({
      [ROOM_LOOPS_KEY]: {
        version: 1,
        loops: {
          ...loops,
          [loop.id]: loop,
        },
      },
    });
  }, []);

  const clearPersistentLoops = useCallback(async () => {
    await OBR.room.setMetadata({
      [ROOM_LOOPS_KEY]: {
        version: 1,
        loops: {},
      },
    });
  }, []);

  const playAudio = useCallback((url) => {
    try {
      const audio = new Audio(url);
      audio._owlbearStopped = false;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;

      audio.play()
        .then(() => {
          setAudioUnlocked(true);
          oneShotAudiosRef.current.push(audio);
          syncActiveSoundsCount();
        })
        .catch((error) => {
          console.warn("Lecture audio bloquée par le navigateur :", error);
          setAudioUnlocked(false);
          showNotification("⚠️ Audio bloqué: cliquez sur Activer l'audio");
        });

      audio.addEventListener("ended", () => {
        oneShotAudiosRef.current = oneShotAudiosRef.current.filter((item) => item !== audio);
        syncActiveSoundsCount();
      });
    } catch (e) {
      console.error("Impossible de créer l'instance Audio :", e);
    }
  }, [showNotification, syncActiveSoundsCount]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      obrUnsubscribesRef.current.forEach((unsubscribe) => unsubscribe?.());
      obrUnsubscribesRef.current = [];
      clearLocalSounds({ updateCount: false });
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, [clearLocalSounds]);

  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudio();
    };

    window.addEventListener("pointerdown", handleFirstInteraction, { capture: true });
    window.addEventListener("keydown", handleFirstInteraction, { capture: true });
    window.addEventListener("touchstart", handleFirstInteraction, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction, { capture: true });
      window.removeEventListener("keydown", handleFirstInteraction, { capture: true });
      window.removeEventListener("touchstart", handleFirstInteraction, { capture: true });
    };
  }, [unlockAudio]);

  useEffect(() => {
    if (!audioUnlocked) return;
    syncPersistentLoops(persistentLoopsRef.current, { alignToStartedAt: true });
  }, [audioUnlocked, syncPersistentLoops]);

  useEffect(() => {
    try {
      OBR.onReady(async () => {
        if (!mountedRef.current) return;
        setIsReady(true);

        const unsubscribePlay = OBR.broadcast.onMessage("mini-tracks-play", (event) => {
          const { url, senderName } = event.data || {};
          if (!url) return;
          addLog("play", `${senderName || "MJ"} a joué: ${event.data?.name || "son"}.`);
          showNotification(`🔊 Son déclenché par ${senderName || "MJ"}`);
          playAudio(url);
        });

        const unsubscribeStop = OBR.broadcast.onMessage("mini-tracks-stop", (event) => {
          const { senderName } = event.data || {};
          addLog("stop", `${senderName || "MJ"} a arrêté tous les sons.`);
          showNotification(`⏹️ Sons arrêtés par ${senderName || "MJ"}`);
          clearLocalSounds();
        });

        obrUnsubscribesRef.current = [unsubscribePlay, unsubscribeStop];
        const metadata = await OBR.room.getMetadata();
        if (!mountedRef.current) return;
        syncPersistentLoops(getLoopsFromMetadata(metadata), { alignToStartedAt: true });

        const unsubscribeMetadata = OBR.room.onMetadataChange((metadataUpdate) => {
          syncPersistentLoops(getLoopsFromMetadata(metadataUpdate), { alignToStartedAt: true });
        });

        obrUnsubscribesRef.current = [unsubscribePlay, unsubscribeStop, unsubscribeMetadata];
      });
    } catch (e) {
      console.warn("OBR non détecté (hors d'Owlbear Rodeo)", e);
    }
  }, [addLog, clearLocalSounds, playAudio, showNotification, syncPersistentLoops]);

  const fetchAudioList = useCallback(async (path) => {
    setLoading(true);
    setDbError(false);
    const targetPath = path && path !== "/" ? path : ROOT_PATH;
    setCurrentPath(targetPath);

    try {
      const res = await fetch(`${apiUrl}?path=${encodeURIComponent(targetPath)}`);
      if (!res.ok) throw new Error("Erreur serveur API");

      const data = await res.json();
      const folders = data?.filter((item) => item.isFolder) || [];
      const files = data?.filter((item) => !item.isFolder) || [];

      const fixedFiles = files.map((file) => ({
        name: file.name,
        url: normalizeAudioUrl(file.url),
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
    fetchAudioList(ROOT_PATH);
  }, [fetchAudioList]);

  const playTrack = useCallback((url, name = "son") => {
    if (!isReady) {
      addLog("play", `Lecture locale: ${name}.`);
      playAudio(url);
      return;
    }

    OBR.player.getName().then((playerName) => {
      OBR.broadcast.sendMessage(
        "mini-tracks-play",
        { url, name, senderName: playerName || "MJ" },
        { destination: "REMOTE" }
      );
      addLog("play", `${playerName || "MJ"} a joué: ${name}.`);
    });
    playAudio(url);
  }, [addLog, isReady, playAudio]);

  const removePersistentLoop = useCallback(async (loopId) => {
    const metadata = await OBR.room.getMetadata();
    const loops = { ...getLoopsFromMetadata(metadata) };
    delete loops[loopId];
    await OBR.room.setMetadata({
      [ROOM_LOOPS_KEY]: {
        version: 1,
        loops,
      },
    });
  }, []);

  const stopTrackLoop = useCallback((trackKey, name = "son") => {
    const loopId = trackKey;
    if (!loopId) return;
    stopLoopInstance(loopId);

    if (!isReady) {
      const nextLoops = { ...(persistentLoopsRef.current || {}) };
      delete nextLoops[loopId];
      syncPersistentLoops(nextLoops, { alignToStartedAt: false });
      return;
    }

    OBR.player.getName().then(async (playerName) => {
      addLog("stop", `${playerName || "MJ"} a arrêté la boucle: ${name}.`);
      try {
        await removePersistentLoop(loopId);
      } catch (error) {
        console.warn("Impossible d'arrêter la boucle active :", error);
        showNotification("⚠️ Boucle arrêtée localement, mais non sauvegardée");
      }
    });
  }, [addLog, isReady, removePersistentLoop, showNotification, stopLoopInstance, syncPersistentLoops]);

  const playTrackLoop = useCallback((url, trackKey, name = "son") => {
    const loopId = trackKey || url;
    if (persistentLoopsRef.current?.[loopId]) {
      stopTrackLoop(loopId, name);
      return;
    }

    const delay = clampDelay(repeatDelays?.[loopId]);
    const loop = {
      id: loopId,
      url,
      trackKey: loopId,
      name,
      repeatDelaySeconds: delay,
      startedAt: Date.now(),
    };

    if (!isReady) {
      startLoopInstance(loop);
      addLog("loop", `Boucle locale activée: ${name} (${formatRepeatDelay(delay)}).`);
      showNotification(delay > 0 ? `🔁 Répétition locale après ${formatRepeatDelay(delay)}` : "🔁 Boucle locale démarrée");
      return;
    }

    OBR.player.getName().then(async (playerName) => {
      const loopWithSender = { ...loop, senderName: playerName || "MJ" };
      startLoopInstance(loopWithSender);
      addLog("loop", `${playerName || "MJ"} a activé la boucle: ${name} (${formatRepeatDelay(delay)}).`);
      showNotification(delay > 0 ? `🔁 Répétition après ${formatRepeatDelay(delay)}` : "🔁 Boucle démarrée");
      try {
        await persistLoop(loopWithSender);
      } catch (error) {
        console.warn("Impossible de sauvegarder la boucle active :", error);
        showNotification("⚠️ Boucle lancée localement, mais non sauvegardée");
      }
    });
  }, [addLog, formatRepeatDelay, isReady, persistLoop, repeatDelays, showNotification, startLoopInstance, stopTrackLoop]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".mp3") && !file.name.endsWith(".wav")) {
      showNotification("⚠️ Format invalide (.mp3 ou .wav uniquement)");
      return;
    }

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

  const handleCreateFolder = async (folderName) => {
    const trimmedName = folderName?.trim();
    if (!trimmedName) {
      showNotification("⚠️ Nom de dossier requis");
      return false;
    }

    setIsCreatingFolder(true);
    showNotification("⏳ Création du dossier...");

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_folder", name: trimmedName, path: currentPath }),
      });
      const result = await response.json();

      if (result.success) {
        showNotification("✅ Dossier ajouté !");
        fetchAudioList(currentPath);
        return true;
      }

      showNotification(response.status === 409 ? "⚠️ Ce dossier existe déjà" : "❌ Échec de la création.");
      return false;
    } catch (err) {
      console.error(err);
      showNotification("❌ Erreur serveur.");
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const changeFolder = (path) => fetchAudioList(path);

  const goBack = () => {
    if (currentPath === ROOT_PATH) return;
    const pathParts = currentPath.split("/").filter((part) => part.length > 0);
    pathParts.pop();
    const newPath = "/" + pathParts.join("/");
    fetchAudioList(newPath === "/" ? ROOT_PATH : newPath);
  };

  const toggleFavorite = (url) => {
    const current = favorites || [];
    const updated = current.includes(url) ? current.filter((fav) => fav !== url) : [...current, url];
    setFavorites(updated);
    localStorage.setItem("owlbear_favorites", JSON.stringify(updated));
  };

  const toggleFolderFavorite = (path) => {
    const current = folderFavorites || [];
    const updated = current.includes(path) ? current.filter((fav) => fav !== path) : [...current, path];
    setFolderFavorites(updated);
    localStorage.setItem("owlbear_folder_favorites", JSON.stringify(updated));
  };

  const saveRepeatDelay = (trackKey, delaySeconds) => {
    if (!trackKey) return;
    const sanitizedDelay = clampDelay(delaySeconds);
    const updated = { ...(repeatDelays || {}) };

    if (sanitizedDelay > 0) {
      updated[trackKey] = sanitizedDelay;
    } else {
      delete updated[trackKey];
    }

    setRepeatDelays(updated);
    localStorage.setItem("owlbear_repeat_delays", JSON.stringify(updated));
    addLog("system", sanitizedDelay > 0 ? `Délai de répétition sauvegardé: ${formatRepeatDelay(sanitizedDelay)}.` : "Délai de répétition remis à immédiat.");
    showNotification(sanitizedDelay > 0 ? `✅ Répétition : ${formatRepeatDelay(sanitizedDelay)}` : "✅ Répétition immédiate");
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    localStorage.setItem("owlbear_volume", newVolume.toString());
    oneShotAudiosRef.current.forEach((audio) => {
      audio.volume = mutedRef.current ? 0 : newVolume;
    });
    loopPlayersRef.current.forEach((player) => {
      if (player.audio) player.audio.volume = mutedRef.current ? 0 : newVolume;
    });
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStorage.setItem("owlbear_isMuted", newMuted.toString());
    oneShotAudiosRef.current.forEach((audio) => {
      audio.volume = newMuted ? 0 : volumeRef.current;
    });
    loopPlayersRef.current.forEach((player) => {
      if (player.audio) player.audio.volume = newMuted ? 0 : volumeRef.current;
    });
  };

  const stopAllSounds = ({ broadcast = false } = {}) => {
    clearLocalSounds();

    if (broadcast && isReady) {
      OBR.player.getName().then(async (playerName) => {
        addLog("stop", `${playerName || "MJ"} a arrêté tous les sons.`);
        OBR.broadcast.sendMessage(
          "mini-tracks-stop",
          { senderName: playerName || "MJ" },
          { destination: "REMOTE" }
        );
        try {
          await clearPersistentLoops();
        } catch (error) {
          console.warn("Impossible de vider les boucles actives :", error);
          showNotification("⚠️ Sons arrêtés localement, mais boucles non sauvegardées");
        }
      });
    }
  };

  return {
    currentPath,
    folderFavorites,
    audioUrl,
    setAudioUrl,
    audioList,
    favorites,
    repeatDelays,
    activeLoops,
    eventLog,
    notification,
    audioUnlocked,
    loading,
    isUploading,
    isCreatingFolder,
    dbError,
    volume,
    isMuted,
    activeSoundsCount,
    changeFolder,
    goBack,
    toggleFavorite,
    toggleFolderFavorite,
    playTrack,
    playTrackLoop,
    stopTrackLoop,
    playAudio,
    handleFileUpload,
    handleCreateFolder,
    handleVolumeChange,
    toggleMute,
    stopAllSounds,
    unlockAudio,
    saveRepeatDelay,
    formatRepeatDelay,
  };
}
