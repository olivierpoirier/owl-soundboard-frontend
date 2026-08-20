import { useState, useEffect, useRef, useCallback } from "react";
import OBR from "@owlbear-rodeo/sdk";

const ROOT_PATH = "/owlbear";
const ROOM_LOOPS_KEY = "owlbear.soundboard.activeLoops";
const LOOP_METADATA_TIMEOUT_MS = 2500;
const MAX_TIMER_DELAY_MS = 60 * 60 * 1000;
const APP_LOG_PREFIX = "[Owl Soundboard]";

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

function getLoopsSignature(loops = {}) {
  return Object.values(loops)
    .filter((loop) => loop?.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((loop) => `${loop.id}:${getLoopSignature(loop)}`)
    .join("||");
}

function normalizeAudioUrl(url) {
  return url.replace(/([?&])dl=0(&|$)/, "$1raw=1$2");
}

function formatLogTime(date = new Date()) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

function appLog(event, details) {
  const debugEnabled = localStorage.getItem("owl_soundboard_debug") === "true";
  if (!debugEnabled) return;

  if (details === undefined) {
    console.log(APP_LOG_PREFIX, event);
    return;
  }
  console.log(APP_LOG_PREFIX, event, details);
}

function appWarn(event, details) {
  if (details === undefined) {
    console.warn(APP_LOG_PREFIX, event);
    return;
  }
  console.warn(APP_LOG_PREFIX, event, details);
}

function appError(event, details) {
  if (details === undefined) {
    console.error(APP_LOG_PREFIX, event);
    return;
  }
  console.error(APP_LOG_PREFIX, event, details);
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
    time: formatLogTime(),
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
      time: formatLogTime(),
      type,
      message,
    };
    setEventLog((current) => [entry, ...current].slice(0, 60));
  }, []);

  const unlockAudio = useCallback(async () => {
    if (audioUnlockedRef.current) {
      return true;
    }

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
      appWarn("audio:unlock-refused", error);
      audioUnlockedRef.current = false;
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

    appLog("repeat:stop-local-instance", {
      loopId,
      hadAudio: Boolean(player.audio),
      hadTimer: Boolean(player.timerId),
      hadProbe: Boolean(player.probe),
    });

    if (player.timerId) {
      clearTimeout(player.timerId);
    }
    if (player.probeTimerId) {
      clearTimeout(player.probeTimerId);
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
    if (existing?.signature === signature && (!existing.playFailed || !audioUnlockedRef.current)) {
      appLog("repeat:skip-already-synced", { loopId: loop.id, signature });
      return;
    }

    stopLoopInstance(loop.id);

    const delay = clampDelay(loop.repeatDelaySeconds);
    appLog("repeat:start-instance", {
      loopId: loop.id,
      name: loop.name,
      delay,
      alignToStartedAt,
      startedAt: loop.startedAt,
      signature,
    });

    const playFrom = (offsetSeconds = 0) => {
      if (!mountedRef.current) return;

      appLog("repeat:play-from", {
        loopId: loop.id,
        name: loop.name,
        offsetSeconds,
        delay,
      });

      const audio = new Audio(loop.url);
      audio._owlbearStopped = false;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      audio.loop = delay === 0;

      audio.addEventListener("ended", () => {
        if (audio._owlbearStopped || delay === 0) return;

        const current = loopPlayersRef.current.get(loop.id);
        if (!current || current.audio !== audio) return;
        audio.src = "";

        appLog("repeat:ended-scheduling-next-play", {
          loopId: loop.id,
          name: loop.name,
          delay,
        });

        const timerId = setTimeout(() => {
          const waiting = loopPlayersRef.current.get(loop.id);
          if (!waiting || waiting.timerId !== timerId) return;
          loopPlayersRef.current.delete(loop.id);
          playFrom(0);
        }, delay * 1000);

        registerLoopPlayer(loop, { audio: null, timerId });
      });

      const startPlayback = () => {
        const current = loopPlayersRef.current.get(loop.id);
        if (!current || current.audio !== audio || audio._owlbearStopped) return;

        audio.play()
          .then(() => {
            audioUnlockedRef.current = true;
            setAudioUnlocked(true);
            appLog("repeat:play-ok", {
              loopId: loop.id,
              name: loop.name,
              currentTime: audio.currentTime,
              duration: audio.duration,
            });
          })
          .catch((error) => {
            appWarn("repeat:play-blocked", {
              loopId: loop.id,
              name: loop.name,
              error,
            });
            audioUnlockedRef.current = false;
            setAudioUnlocked(false);
            addLog("warn", "Lecture bloquée par le navigateur. Activation audio requise.");
            showNotification("⚠️ Audio bloqué: cliquez sur Activer l'audio");

            const latest = loopPlayersRef.current.get(loop.id);
            if (latest?.audio === audio) {
              loopPlayersRef.current.set(loop.id, { ...latest, playFailed: true });
              syncActiveSoundsCount();
            }
          });
      };

      registerLoopPlayer(loop, { audio, timerId: null });

      if (offsetSeconds > 0) {
        const seekAndPlay = () => {
          const current = loopPlayersRef.current.get(loop.id);
          if (!current || current.audio !== audio || audio._owlbearStopped) return;

          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          const safeOffset = duration > 0 ? Math.min(offsetSeconds, Math.max(0, duration - 0.05)) : offsetSeconds;
          try {
            audio.currentTime = safeOffset;
          } catch (error) {
            appWarn("repeat:seek-failed", {
              loopId: loop.id,
              name: loop.name,
              offsetSeconds,
              safeOffset,
              error,
            });
          }
          startPlayback();
        };

        audio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
        audio.addEventListener("error", startPlayback, { once: true });
        audio.load?.();
        return;
      }

      startPlayback();
    };

    const scheduleAfter = (waitSeconds) => {
      const startedAt = Date.now();
      const waitMs = Math.max(0, waitSeconds * 1000);
      appLog("repeat:schedule-next-play", {
        loopId: loop.id,
        name: loop.name,
        waitSeconds,
        cappedTimerMs: Math.min(waitMs, MAX_TIMER_DELAY_MS),
      });

      const timerId = setTimeout(() => {
        const waiting = loopPlayersRef.current.get(loop.id);
        if (!waiting || waiting.timerId !== timerId) return;

        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        const remainingSeconds = Math.max(0, waitSeconds - elapsedSeconds);
        if (remainingSeconds > 0.5) {
          appLog("repeat:timer-cap-continue-waiting", {
            loopId: loop.id,
            name: loop.name,
            remainingSeconds,
          });
          loopPlayersRef.current.delete(loop.id);
          scheduleAfter(remainingSeconds);
          return;
        }

        loopPlayersRef.current.delete(loop.id);
        playFrom(0);
      }, Math.min(waitMs, MAX_TIMER_DELAY_MS));

      registerLoopPlayer(loop, { audio: null, timerId });
    };

    if (!alignToStartedAt) {
      playFrom(0);
      return;
    }

    const probe = new Audio(loop.url);
    probe.preload = "metadata";
    let probeTimerId = null;
    let probeResolved = false;

    const resolveProbe = (duration = 0) => {
      if (probeResolved) return;
      probeResolved = true;
      if (probeTimerId) clearTimeout(probeTimerId);

      const current = loopPlayersRef.current.get(loop.id);
      if (!current || current.signature !== signature || current.probe !== probe) return;

      probe.src = "";
      appLog("repeat:metadata-resolved", {
        loopId: loop.id,
        name: loop.name,
        duration,
        delay,
      });

      if (!Number.isFinite(duration) || duration <= 0) {
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
    };

    probe.addEventListener("loadedmetadata", () => {
      resolveProbe(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0);
    }, { once: true });
    probe.addEventListener("error", () => {
      appWarn("repeat:metadata-error", { loopId: loop.id, name: loop.name });
      resolveProbe(0);
    }, { once: true });
    probeTimerId = setTimeout(() => {
      appWarn("repeat:metadata-timeout", {
        loopId: loop.id,
        name: loop.name,
        timeoutMs: LOOP_METADATA_TIMEOUT_MS,
      });
      resolveProbe(0);
    }, LOOP_METADATA_TIMEOUT_MS);
    registerLoopPlayer(loop, { audio: null, timerId: null, probe, probeTimerId });
    probe.load?.();
  }, [addLog, registerLoopPlayer, showNotification, stopLoopInstance, syncActiveSoundsCount]);

  const syncPersistentLoops = useCallback((loops, { alignToStartedAt = true } = {}) => {
    const previousLoops = persistentLoopsRef.current || {};
    const nextLoops = loops || {};
    const loopsChanged = getLoopsSignature(previousLoops) !== getLoopsSignature(nextLoops);
    persistentLoopsRef.current = nextLoops;

    appLog("repeat:sync-persistent-loops", {
      previousCount: Object.keys(previousLoops).length,
      nextCount: Object.keys(nextLoops).length,
      alignToStartedAt,
      audioUnlocked: audioUnlockedRef.current,
      loopsChanged,
    });

    const loopEntries = Object.values(nextLoops).filter((loop) => loop?.id && loop?.url);
    if (loopsChanged) {
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

      const activeIds = new Set(loopEntries.map((loop) => loop.id));
      loopPlayersRef.current.forEach((_, loopId) => {
        if (!activeIds.has(loopId)) {
          stopLoopInstance(loopId);
        }
      });
    }

    if (!audioUnlockedRef.current) return;

    loopEntries.forEach((loop) => startLoopInstance(loop, { alignToStartedAt }));
  }, [addLog, formatRepeatDelay, startLoopInstance, stopLoopInstance]);

  useEffect(() => {
    resumePersistentLoopsRef.current = () => {
      syncPersistentLoops(persistentLoopsRef.current, { alignToStartedAt: true });
    };
  }, [syncPersistentLoops]);

  const persistLoop = useCallback(async (loop) => {
    appLog("repeat:persist-start", {
      loopId: loop.id,
      name: loop.name,
      repeatDelaySeconds: loop.repeatDelaySeconds,
    });

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
    appLog("repeat:persist-ok", { loopId: loop.id, name: loop.name });
  }, []);

  const clearPersistentLoops = useCallback(async () => {
    appLog("repeat:clear-persistent-loops");
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
          appWarn("audio:play-blocked", error);
          audioUnlockedRef.current = false;
          setAudioUnlocked(false);
          showNotification("⚠️ Audio bloqué: cliquez sur Activer l'audio");
        });

      audio.addEventListener("ended", () => {
        oneShotAudiosRef.current = oneShotAudiosRef.current.filter((item) => item !== audio);
        syncActiveSoundsCount();
      });
    } catch (e) {
      appError("audio:create-instance-failed", e);
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
          appLog("obr:broadcast-play-received", {
            name: event.data?.name,
            senderName,
          });
          addLog("play", `${senderName || "MJ"} a joué: ${event.data?.name || "son"}.`);
          showNotification(`🔊 Son déclenché par ${senderName || "MJ"}`);
          playAudio(url);
        });

        const unsubscribeStop = OBR.broadcast.onMessage("mini-tracks-stop", (event) => {
          const { senderName } = event.data || {};
          appLog("obr:broadcast-stop-received", { senderName });
          addLog("stop", `${senderName || "MJ"} a arrêté tous les sons.`);
          showNotification(`⏹️ Sons arrêtés par ${senderName || "MJ"}`);
          clearLocalSounds();
        });

        obrUnsubscribesRef.current = [unsubscribePlay, unsubscribeStop];
        const metadata = await OBR.room.getMetadata();
        if (!mountedRef.current) return;
        syncPersistentLoops(getLoopsFromMetadata(metadata), { alignToStartedAt: true });

        const unsubscribeMetadata = OBR.room.onMetadataChange((metadataUpdate) => {
          appLog("obr:metadata-change", {
            loopCount: Object.keys(getLoopsFromMetadata(metadataUpdate)).length,
          });
          syncPersistentLoops(getLoopsFromMetadata(metadataUpdate), { alignToStartedAt: true });
        });

        obrUnsubscribesRef.current = [unsubscribePlay, unsubscribeStop, unsubscribeMetadata];
      });
    } catch (e) {
      appWarn("obr:not-detected", e);
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
      appError("dropbox:fetch-audio-list-failed", {
        path: targetPath,
        error,
      });
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
        appWarn("repeat:remove-persistent-loop-failed", {
          loopId,
          name,
          error,
        });
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
      syncPersistentLoops({ ...(persistentLoopsRef.current || {}), [loopId]: loop }, { alignToStartedAt: false });
      showNotification(delay > 0 ? `🔁 Répétition locale après ${formatRepeatDelay(delay)}` : "🔁 Boucle locale démarrée");
      return;
    }

    OBR.player.getName().then(async (playerName) => {
      const loopWithSender = { ...loop, senderName: playerName || "MJ" };
      appLog("repeat:toggle-start", {
        loopId,
        name,
        playerName: playerName || "MJ",
        delay,
      });
      startLoopInstance(loopWithSender);
      syncPersistentLoops({ ...(persistentLoopsRef.current || {}), [loopId]: loopWithSender }, { alignToStartedAt: false });
      showNotification(delay > 0 ? `🔁 Répétition après ${formatRepeatDelay(delay)}` : "🔁 Boucle démarrée");
      try {
        await persistLoop(loopWithSender);
      } catch (error) {
        appWarn("repeat:persist-failed", {
          loopId,
          name,
          error,
        });
        showNotification("⚠️ Boucle lancée localement, mais non sauvegardée");
      }
    });
  }, [formatRepeatDelay, isReady, persistLoop, repeatDelays, showNotification, startLoopInstance, stopTrackLoop, syncPersistentLoops]);

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
      appError("dropbox:upload-failed", err);
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
      appError("dropbox:create-folder-failed", err);
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

    const activeLoop = persistentLoopsRef.current?.[trackKey];
    if (!activeLoop) return;

    const updatedLoop = {
      ...activeLoop,
      repeatDelaySeconds: sanitizedDelay,
      startedAt: Date.now(),
    };
    const nextLoops = {
      ...(persistentLoopsRef.current || {}),
      [trackKey]: updatedLoop,
    };
    syncPersistentLoops(nextLoops, { alignToStartedAt: false });

    if (isReady) {
      persistLoop(updatedLoop).catch((error) => {
        appWarn("repeat:update-active-delay-failed", {
          trackKey,
          sanitizedDelay,
          error,
        });
        showNotification("⚠️ Répétition changée localement, mais non sauvegardée");
      });
    }
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
          appWarn("repeat:clear-persistent-loops-failed", error);
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
