import { useState, useEffect, useRef, useCallback } from "react";
import OBR from "@owlbear-rodeo/sdk";

const ROOT_PATH = "/";
const FALLBACK_ROOM_ID = "standalone";
const ROOM_LOOPS_KEY = "owlbear.soundboard.activeLoops";
const AUDIO_LIBRARY_CHANGED_CHANNEL = "mini-tracks-library-changed";
const LOOP_METADATA_TIMEOUT_MS = 2500;
const MAX_TIMER_DELAY_MS = 60 * 60 * 1000;
const AUDIO_LIST_CACHE_TTL_MS = 45 * 1000;
const RECENT_LIBRARY_CHANGE_TTL_MS = 30 * 1000;
const AUDIO_LIST_REQUEST_TIMEOUT_MS = 12 * 1000;
const AUDIO_LIST_STORAGE_PREFIX = "owlbear.soundboard.audioList.";
const APP_LOG_PREFIX = "[Owl Soundboard]";
const SUPPORTED_AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "opus", "m4a", "aac", "flac", "webm"];
const audioListCache = new Map();

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

function getAudioListCacheKey(roomId, path) {
  return `${roomId || FALLBACK_ROOM_ID}:${path || ROOT_PATH}`;
}

function getAudioListStorageKey(cacheKey) {
  return `${AUDIO_LIST_STORAGE_PREFIX}${encodeURIComponent(cacheKey)}`;
}

function readAudioListCache(cacheKey, { allowStale = false } = {}) {
  const now = Date.now();
  const memoryEntry = audioListCache.get(cacheKey);
  if (memoryEntry && (allowStale || now - memoryEntry.cachedAt < AUDIO_LIST_CACHE_TTL_MS)) {
    return memoryEntry.items;
  }

  try {
    const rawEntry = sessionStorage.getItem(getAudioListStorageKey(cacheKey));
    if (!rawEntry) return null;

    const entry = JSON.parse(rawEntry);
    if (!entry?.cachedAt || !Array.isArray(entry.items)) return null;
    audioListCache.set(cacheKey, entry);

    if (allowStale || now - entry.cachedAt < AUDIO_LIST_CACHE_TTL_MS) {
      return entry.items;
    }
  } catch {
    return null;
  }

  return null;
}

function writeAudioListCache(cacheKey, items) {
  const entry = {
    cachedAt: Date.now(),
    items,
  };
  audioListCache.set(cacheKey, entry);

  try {
    sessionStorage.setItem(getAudioListStorageKey(cacheKey), JSON.stringify(entry));
  } catch {
    // Storage can be blocked in some embedded browser contexts; memory cache still helps.
  }
}

function clearAudioListCache(cacheKey) {
  audioListCache.delete(cacheKey);
  try {
    sessionStorage.removeItem(getAudioListStorageKey(cacheKey));
  } catch {
    // The in-memory cache was still cleared.
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AUDIO_LIST_REQUEST_TIMEOUT_MS) {
  const timeoutController = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;
  const abortFromExternalSignal = () => timeoutController.abort(externalSignal?.reason);

  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: timeoutController.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`Le serveur n'a pas répondu après ${Math.round(timeoutMs / 1000)} secondes.`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

function getFileExtension(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}

function isSupportedAudioFile(file) {
  return SUPPORTED_AUDIO_EXTENSIONS.includes(getFileExtension(file?.name));
}

function getAudioContentType(file) {
  if (file?.type?.startsWith("audio/")) return file.type;
  const fallbackTypes = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    webm: "audio/webm",
  };
  return fallbackTypes[getFileExtension(file?.name)] || "audio/mpeg";
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function getParentPath(path = "/") {
  const parts = String(path || "/").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : ROOT_PATH;
}

function samePath(left = "/", right = "/") {
  return (left || ROOT_PATH) === (right || ROOT_PATH);
}

function normalizeAudioFileItem(file, roomId) {
  return {
    id: file.id || `${roomId}:${file.path || file.url}`,
    name: file.name,
    url: normalizeAudioUrl(file.url),
    isFolder: false,
    path: file.path,
    size: file.size,
    updatedAt: file.updatedAt,
  };
}

async function hashFile(file) {
  if (!window.crypto?.subtle) return "";
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  const obrReadyGenerationRef = useRef(0);
  const currentPathRef = useRef(ROOT_PATH);
  const refreshAudioListRef = useRef(() => Promise.resolve(false));
  const deletedTracksRef = useRef(new Map());
  const recentUploadsRef = useRef(new Map());
  const uploadInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(new Set());
  const audioUnlockedRef = useRef(false);
  const persistentLoopsRef = useRef({});
  const resumePersistentLoopsRef = useRef(() => {});
  const mountedRef = useRef(true);
  const listRequestRef = useRef({
    key: null,
    promise: null,
    controller: null,
    requestId: 0,
  });

  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [roomId, setRoomId] = useState(() => (window.self === window.top ? FALLBACK_ROOM_ID : null));
  const [playerId, setPlayerId] = useState(FALLBACK_ROOM_ID);
  const [playerRole, setPlayerRole] = useState("PLAYER");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioList, setAudioList] = useState([]);
  const [quota, setQuota] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [deletingPath, setDeletingPath] = useState(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
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

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

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

  const pruneRecentLibraryChanges = useCallback(() => {
    const now = Date.now();

    deletedTracksRef.current.forEach((expiresAt, key) => {
      if (expiresAt <= now) deletedTracksRef.current.delete(key);
    });

    recentUploadsRef.current.forEach((entry, key) => {
      if (!entry?.expiresAt || entry.expiresAt <= now) recentUploadsRef.current.delete(key);
    });
  }, []);

  const isRecentlyDeleted = useCallback((file) => {
    if (!file) return false;
    pruneRecentLibraryChanges();
    return Boolean(
      (file.path && deletedTracksRef.current.has(file.path)) ||
      (file.id && deletedTracksRef.current.has(file.id))
    );
  }, [pruneRecentLibraryChanges]);

  const markRecentlyDeleted = useCallback((file) => {
    if (!file) return;

    const expiresAt = Date.now() + RECENT_LIBRARY_CHANGE_TTL_MS;
    if (typeof file === "string") {
      deletedTracksRef.current.set(file, expiresAt);
      recentUploadsRef.current.delete(file);
      return;
    }

    if (file.path) {
      deletedTracksRef.current.set(file.path, expiresAt);
      recentUploadsRef.current.delete(file.path);
    }
    if (file.id) {
      deletedTracksRef.current.set(file.id, expiresAt);
      recentUploadsRef.current.delete(file.id);
    }
  }, []);

  const rememberRecentUpload = useCallback((file) => {
    if (!file?.path) return;

    const normalizedFile = normalizeAudioFileItem(file, roomId);
    const entry = {
      file: normalizedFile,
      expiresAt: Date.now() + RECENT_LIBRARY_CHANGE_TTL_MS,
    };
    recentUploadsRef.current.set(normalizedFile.path, entry);
    if (normalizedFile.id) recentUploadsRef.current.set(normalizedFile.id, entry);
    deletedTracksRef.current.delete(normalizedFile.path);
    if (normalizedFile.id) deletedTracksRef.current.delete(normalizedFile.id);
  }, [roomId]);

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
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      listRequestRef.current.controller?.abort();
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
    let cancelled = false;
    const readyGeneration = obrReadyGenerationRef.current + 1;
    obrReadyGenerationRef.current = readyGeneration;

    try {
      OBR.onReady(async () => {
        if (cancelled || !mountedRef.current || obrReadyGenerationRef.current !== readyGeneration) return;
        setIsReady(true);
        setRoomId(OBR.room.id || FALLBACK_ROOM_ID);
        setPlayerId(OBR.player.id || FALLBACK_ROOM_ID);
        OBR.player.getRole()
          .then((role) => setPlayerRole(role || "PLAYER"))
          .catch(() => setPlayerRole("PLAYER"));

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

        const unsubscribeLibraryChanged = OBR.broadcast.onMessage(AUDIO_LIBRARY_CHANGED_CHANNEL, (event) => {
          const { roomId: changedRoomId, path, action, item } = event.data || {};
          if (changedRoomId && changedRoomId !== OBR.room.id) return;

          appLog("obr:library-changed-received", {
            action,
            path,
          });

          if (action === "delete" && path) {
            markRecentlyDeleted(path);
            setAudioList((items) => (items || []).filter((entry) => entry.path !== path));
          }

          if (action === "upload" && item?.path) {
            const normalizedFile = normalizeAudioFileItem(item, changedRoomId || OBR.room.id);
            rememberRecentUpload(normalizedFile);
            if (samePath(getParentPath(normalizedFile.path), currentPathRef.current)) {
              setAudioList((items) => {
                const withoutExisting = (items || []).filter((entry) =>
                  entry.isFolder || (entry.path !== normalizedFile.path && entry.id !== normalizedFile.id)
                );
                return [...withoutExisting, normalizedFile].sort((a, b) => {
                  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
                  return a.name.localeCompare(b.name);
                });
              });
            }
          }

          if (action === "create_folder" && item?.path) {
            const folderParentPath = getParentPath(item.path);
            if (samePath(folderParentPath, currentPathRef.current)) {
              setAudioList((items) => {
                const normalizedFolder = {
                  name: item.name,
                  path: item.path,
                  isFolder: true,
                };
                const withoutExisting = (items || []).filter((entry) => entry.path !== normalizedFolder.path);
                return [...withoutExisting, normalizedFolder].sort((a, b) => {
                  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
                  return a.name.localeCompare(b.name);
                });
              });
            }
          }

          window.setTimeout(() => {
            refreshAudioListRef.current(currentPathRef.current, { force: true });
          }, 750);
        });

        obrUnsubscribesRef.current = [unsubscribePlay, unsubscribeStop, unsubscribeLibraryChanged];
        const metadata = await OBR.room.getMetadata();
        if (cancelled || !mountedRef.current || obrReadyGenerationRef.current !== readyGeneration) {
          unsubscribePlay?.();
          unsubscribeStop?.();
          unsubscribeLibraryChanged?.();
          return;
        }
        syncPersistentLoops(getLoopsFromMetadata(metadata), { alignToStartedAt: true });

        const unsubscribeMetadata = OBR.room.onMetadataChange((metadataUpdate) => {
          appLog("obr:metadata-change", {
            loopCount: Object.keys(getLoopsFromMetadata(metadataUpdate)).length,
          });
          syncPersistentLoops(getLoopsFromMetadata(metadataUpdate), { alignToStartedAt: true });
        });

        obrUnsubscribesRef.current = [unsubscribePlay, unsubscribeStop, unsubscribeLibraryChanged, unsubscribeMetadata];
      });
    } catch (e) {
      appWarn("obr:not-detected", e);
    }

    return () => {
      cancelled = true;
      obrReadyGenerationRef.current += 1;
      obrUnsubscribesRef.current.forEach((unsubscribe) => unsubscribe?.());
      obrUnsubscribesRef.current = [];
    };
  }, [addLog, clearLocalSounds, markRecentlyDeleted, playAudio, rememberRecentUpload, showNotification, syncPersistentLoops]);

  const applyAudioList = useCallback((items) => {
    pruneRecentLibraryChanges();

    const nextItems = (Array.isArray(items) ? items : [])
      .filter((item) => item.isFolder || !isRecentlyDeleted(item));
    const recentUploadPaths = new Set();

    recentUploadsRef.current.forEach((entry) => {
      const file = entry?.file;
      if (!file?.path || recentUploadPaths.has(file.path) || isRecentlyDeleted(file)) return;
      if (!samePath(getParentPath(file.path), currentPathRef.current)) return;
      if (nextItems.some((item) => item.path === file.path || item.id === file.id)) return;

      recentUploadPaths.add(file.path);
      nextItems.push(file);
    });

    nextItems.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const files = nextItems.filter((item) => !item.isFolder);

    setAudioList(nextItems);
    setAudioUrl((currentUrl) => {
      if (files.some((file) => file.url === currentUrl)) return currentUrl;
      return files[0]?.url || "";
    });
  }, [isRecentlyDeleted, pruneRecentLibraryChanges]);

  const fetchAudioList = useCallback((path, { force = false, reason = "navigation" } = {}) => {
    if (!roomId) {
      setLoading(true);
      return Promise.resolve(false);
    }

    const targetPath = path && path !== "/" ? path : ROOT_PATH;
    const requestKey = getAudioListCacheKey(roomId, targetPath);
    const currentRequest = listRequestRef.current;

    // Show a cached list immediately when available, but always continue with a
    // network request. Session storage must never be the final source of truth.
    const cachedItems = !force ? readAudioListCache(requestKey) : null;
    if (cachedItems) {
      appLog("storage:show-audio-list-cache", { roomId, path: targetPath, count: cachedItems.length });
      setCurrentPath(targetPath);
      setDbError(false);
      setLoading(false);
      applyAudioList(cachedItems);
    }

    if (!force && currentRequest.promise && currentRequest.key === requestKey) {
      appLog("storage:reuse-audio-list-request", { roomId, path: targetPath });
      return currentRequest.promise;
    }

    currentRequest.controller?.abort();

    const controller = new AbortController();
    const requestId = currentRequest.requestId + 1;

    const requestPromise = (async () => {
      setLoading(!cachedItems);
      setDbError(false);
      setCurrentPath(targetPath);
      addLog("storage", `Synchronisation ${targetPath} (${reason})...`);

      try {
        const params = new URLSearchParams({ path: targetPath });
        params.set("roomId", roomId);
        if (force) params.set("refresh", "1");
        params.set("_", `${Date.now()}-${requestId}`);

        let res;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            res = await fetchWithTimeout(`${apiUrl}?${params.toString()}`, {
              signal: controller.signal,
              cache: "no-store",
            });
            if (res.ok || res.status < 500 || attempt === 2) break;
            addLog("warn", `Liste indisponible (HTTP ${res.status}), nouvel essai...`);
          } catch (error) {
            if (controller.signal.aborted || attempt === 2) throw error;
            addLog("warn", `${error.message} Nouvel essai de la liste...`);
          }
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || `Erreur API HTTP ${res.status}`);
        if (!mountedRef.current || listRequestRef.current.requestId !== requestId) return false;

        if (payload?.quota) {
          setQuota(payload.quota);
        }

        const entries = Array.isArray(payload) ? payload : payload?.items;
        if (!Array.isArray(entries)) {
          throw new Error("La réponse de la liste audio est invalide.");
        }
        const folders = entries?.filter((item) => item.isFolder) || [];
        const files = entries?.filter((item) => !item.isFolder) || [];

        const fixedFiles = files.map((file) => normalizeAudioFileItem(file, roomId));

        const nextItems = [...folders, ...fixedFiles];
        writeAudioListCache(requestKey, nextItems);
        applyAudioList(nextItems);
        addLog("storage", `Liste synchronisée : ${files.length} son${files.length > 1 ? "s" : ""}, ${folders.length} dossier${folders.length > 1 ? "s" : ""}.`);
        return true;
      } catch (error) {
        if (error?.name === "AbortError" && controller.signal.aborted) return false;

        if (mountedRef.current && listRequestRef.current.requestId === requestId) {
          const staleItems = readAudioListCache(requestKey, { allowStale: true });
          if (staleItems) {
            appWarn("storage:fetch-audio-list-failed-using-cache", {
              roomId,
              path: targetPath,
              error,
            });
            setDbError(true);
            applyAudioList(staleItems);
            addLog("warn", `Liste R2 inaccessible : ${error.message} Cache local affiché.`);
            showNotification("⚠️ Liste audio temporairement servie depuis le cache");
            return true;
          }

          appError("storage:fetch-audio-list-failed", {
            roomId,
            path: targetPath,
            error,
          });
          setDbError(true);
          setAudioList([]);
          addLog("error", `Échec de la liste : ${error.message}`);
        }
        return false;
      } finally {
        if (listRequestRef.current.requestId === requestId) {
          listRequestRef.current = {
            key: requestKey,
            promise: null,
            controller: null,
            requestId,
          };
          if (mountedRef.current) setLoading(false);
        }
      }
    })();

    listRequestRef.current = {
      key: requestKey,
      promise: requestPromise,
      controller,
      requestId,
    };

    return requestPromise;
  }, [addLog, apiUrl, applyAudioList, roomId, showNotification]);

  useEffect(() => {
    refreshAudioListRef.current = fetchAudioList;
  }, [fetchAudioList]);

  useEffect(() => {
    if (!roomId) return;
    fetchAudioList(ROOT_PATH, { reason: "ouverture" });
  }, [fetchAudioList, roomId]);

  const broadcastLibraryChanged = useCallback((action, path, item) => {
    if (!isReady || !roomId) return;

    OBR.broadcast.sendMessage(
      AUDIO_LIBRARY_CHANGED_CHANNEL,
      { action, path, roomId, item },
      { destination: "REMOTE" }
    );
  }, [isReady, roomId]);

  const addOrUpdateLocalFile = useCallback((file) => {
    if (!file?.path || file.isFolder) return;

    const normalizedFile = normalizeAudioFileItem(file, roomId);
    rememberRecentUpload(normalizedFile);
    if (!samePath(getParentPath(normalizedFile.path), currentPathRef.current)) return;

    setAudioList((items) => {
      const withoutExisting = (items || []).filter((item) =>
        item.isFolder || (item.path !== normalizedFile.path && item.id !== normalizedFile.id)
      );
      return [...withoutExisting, normalizedFile].sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    });
    setAudioUrl((currentUrl) => currentUrl || normalizedFile.url);
  }, [rememberRecentUpload, roomId]);

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

    if (uploadInFlightRef.current) {
      addLog("warn", "Un téléversement est déjà en cours.");
      e.target.value = "";
      return;
    }

    if (!roomId) {
      showNotification("⚠️ Room Owlbear non détectée");
      e.target.value = "";
      return;
    }

    if (!rightsConfirmed) {
      showNotification("⚠️ Confirmez les droits du fichier avant l'upload");
      e.target.value = "";
      return;
    }

    if (!isSupportedAudioFile(file)) {
      showNotification("⚠️ Format invalide (mp3, wav, ogg, m4a, flac, webm)");
      e.target.value = "";
      return;
    }

    if (quota?.limits?.maxUploadBytes && file.size > quota.limits.maxUploadBytes) {
      showNotification(`⚠️ Fichier trop lourd (max ${formatBytes(quota.limits.maxUploadBytes)})`);
      e.target.value = "";
      return;
    }

    if (quota && (quota.remainingFiles <= 0 || file.size > quota.remainingBytes)) {
      showNotification("⚠️ Quota de la room atteint");
      e.target.value = "";
      return;
    }

    uploadInFlightRef.current = true;
    setIsUploading(true);
    addLog("storage", `Upload demandé : ${file.name} (${formatBytes(file.size)}).`);
    showNotification("⏳ Préparation de l'upload...");

    try {
      const contentType = getAudioContentType(file);
      const sha256 = await hashFile(file).catch((error) => {
        appWarn("storage:file-hash-failed", error);
        return "";
      });

      const prepareResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_upload",
          roomId,
          uploaderId: playerId,
          uploaderRole: playerRole,
          path: currentPath,
          name: file.name,
          size: file.size,
          type: contentType,
          sha256,
          rightsConfirmed,
        }),
      });

      const prepareResult = await prepareResponse.json().catch(() => ({}));
      if (prepareResult.quota) setQuota(prepareResult.quota);

      if (!prepareResponse.ok || !prepareResult?.upload?.url) {
        throw new Error(prepareResult?.error || "Upload refusé par le serveur");
      }

      addLog("storage", `Upload préparé : ${prepareResult.upload.path}.`);

      showNotification("⏳ Envoi du fichier...");
      const uploadResponse = await fetch(prepareResult.upload.url, {
        method: prepareResult.upload.method || "PUT",
        headers: prepareResult.upload.headers || { "Content-Type": contentType },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload R2 refusé (HTTP ${uploadResponse.status}). Vérifiez le CORS du bucket.`);
      }

      addLog("storage", `Fichier reçu par R2 (HTTP ${uploadResponse.status}).`);

      const uploadedItem = {
        id: prepareResult.upload.key,
        name: prepareResult.upload.path.split("/").filter(Boolean).pop() || file.name,
        url: prepareResult.upload.publicUrl,
        isFolder: false,
        path: prepareResult.upload.path,
        size: file.size,
      };
      addOrUpdateLocalFile(uploadedItem);
      clearAudioListCache(getAudioListCacheKey(roomId, currentPath));

      const completeResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_upload",
          roomId,
          uploaderId: playerId,
          uploaderRole: playerRole,
          path: prepareResult.upload.path,
          key: prepareResult.upload.key,
          name: file.name,
          size: file.size,
          type: contentType,
          sha256,
        }),
      });

      const completeResult = await completeResponse.json().catch(() => ({}));
      if (completeResult.quota) setQuota(completeResult.quota);

      if (!completeResponse.ok) {
        appWarn("storage:complete-upload-failed", completeResult);
        addLog("warn", `Son présent dans R2, confirmation API échouée (HTTP ${completeResponse.status}) : ${completeResult?.error || "erreur inconnue"}`);
        showNotification("⚠️ Son ajouté, confirmation incomplète");
      } else {
        addLog("storage", completeResult.auditSaved === false
          ? `Upload confirmé, mais audit R2 incomplet : ${prepareResult.upload.path}.`
          : `Upload confirmé : ${prepareResult.upload.path}.`);
        showNotification(completeResult.warning ? "⚠️ Son ajouté, audit incomplet" : "✅ Son ajouté !");
      }

      const finalItem = completeResult.item || uploadedItem;
      addOrUpdateLocalFile(finalItem);
      broadcastLibraryChanged("upload", prepareResult.upload.path, finalItem);
      fetchAudioList(currentPath, { force: true, reason: "après upload" });
    } catch (err) {
      appError("storage:upload-failed", err);
      addLog("error", `Échec upload ${file.name} : ${err?.message || "erreur inconnue"}`);
      showNotification(err?.message || "❌ Erreur d'upload.");
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleCreateFolder = async (folderName) => {
    const trimmedName = folderName?.trim();
    if (!trimmedName) {
      showNotification("⚠️ Nom de dossier requis");
      return false;
    }

    if (!roomId) {
      showNotification("⚠️ Room Owlbear non détectée");
      return false;
    }

    setIsCreatingFolder(true);
    showNotification("⏳ Création du dossier...");

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_folder",
          roomId,
          uploaderId: playerId,
          uploaderRole: playerRole,
          name: trimmedName,
          path: currentPath,
        }),
      });
      const result = await response.json();
      if (result.quota) setQuota(result.quota);

      if (result.success) {
        showNotification("✅ Dossier ajouté !");
        broadcastLibraryChanged("create_folder", result.item?.path || currentPath, result.item);
        fetchAudioList(currentPath, { force: true });
        return true;
      }

      showNotification(response.status === 409 ? "⚠️ Ce dossier existe déjà" : "❌ Échec de la création.");
      return false;
    } catch (err) {
      appError("storage:create-folder-failed", err);
      showNotification("❌ Erreur serveur.");
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteTrack = async (file) => {
    if (!file || file.isFolder || !file.path) return false;

    if (deleteInFlightRef.current.has(file.path)) {
      addLog("warn", `Suppression déjà en cours : ${file.name}.`);
      return false;
    }

    if (!roomId) {
      showNotification("⚠️ Room Owlbear non détectée");
      return false;
    }

    if (!rightsConfirmed) {
      showNotification("⚠️ Confirmez les droits avant de modifier la bibliothèque");
      return false;
    }

    const displayName = file.name?.replace(/\.(mp3|wav|ogg|opus|m4a|aac|flac|webm)$/i, "") || "ce son";
    const confirmed = window.confirm(`Supprimer "${displayName}" de cette room ?`);
    if (!confirmed) return false;

    const trackKey = file.id || file.path || file.url;
    deleteInFlightRef.current.add(file.path);
    setDeletingPath(file.path);
    addLog("storage", `Suppression demandée : ${file.path}.`);
    showNotification("⏳ Suppression du son...");

    try {
      const params = new URLSearchParams({ roomId, path: file.path });
      if (file.id?.startsWith(`rooms/${roomId}/`)) params.set("key", file.id);
      const response = await fetch(`${apiUrl}?${params.toString()}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (result.quota) setQuota(result.quota);

      if (!response.ok) {
        throw new Error(`${result?.error || "Suppression refusée"} (HTTP ${response.status})`);
      }

      addLog("storage", result.deleted?.alreadyMissing
        ? `Fichier déjà absent de R2 : ${file.path}.`
        : `Suppression confirmée par R2 : ${file.path}.`);

      if (persistentLoopsRef.current?.[trackKey]) {
        stopTrackLoop(trackKey, displayName);
      }

      markRecentlyDeleted(file);
      clearAudioListCache(getAudioListCacheKey(roomId, currentPathRef.current));
      setAudioList((items) => items.filter((item) => item.path !== file.path));
      setFavorites((current) => {
        const updated = (current || []).filter((favorite) => favorite !== file.url);
        localStorage.setItem("owlbear_favorites", JSON.stringify(updated));
        return updated;
      });
      setRepeatDelays((current) => {
        const updated = { ...(current || {}) };
        delete updated[trackKey];
        localStorage.setItem("owlbear_repeat_delays", JSON.stringify(updated));
        return updated;
      });

      broadcastLibraryChanged("delete", file.path);
      showNotification("✅ Son supprimé");
      window.setTimeout(() => {
        fetchAudioList(currentPathRef.current, { force: true, reason: "après suppression" });
      }, 750);
      return true;
    } catch (error) {
      appError("storage:delete-track-failed", error);
      addLog("error", `Échec suppression ${file.path} : ${error?.message || "erreur inconnue"}`);
      showNotification(error?.message || "❌ Suppression impossible");
      return false;
    } finally {
      deleteInFlightRef.current.delete(file.path);
      setDeletingPath(null);
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
    roomId,
    playerId,
    playerRole,
    folderFavorites,
    audioUrl,
    setAudioUrl,
    audioList,
    quota,
    favorites,
    repeatDelays,
    activeLoops,
    eventLog,
    notification,
    audioUnlocked,
    loading,
    isUploading,
    isCreatingFolder,
    deletingPath,
    rightsConfirmed,
    setRightsConfirmed,
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
    handleDeleteTrack,
    handleVolumeChange,
    toggleMute,
    stopAllSounds,
    unlockAudio,
    saveRepeatDelay,
    formatRepeatDelay,
  };
}
