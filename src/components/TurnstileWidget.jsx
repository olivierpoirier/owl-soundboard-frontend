import { useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT_ID = "owl-soundboard-turnstile";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
    const script = existingScript || document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("API Turnstile indisponible"));
    };
    const handleError = () => reject(new Error("Impossible de charger Turnstile"));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return turnstileScriptPromise;
}

export default function TurnstileWidget({ siteKey, onTokenChange, resetKey }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "sound-library-write",
          theme: "dark",
          size: "flexible",
          appearance: "interaction-only",
          retry: "auto",
          "refresh-expired": "auto",
          callback: (token) => {
            setStatus("ready");
            onTokenChange(token);
          },
          "expired-callback": () => {
            setStatus("loading");
            onTokenChange("");
          },
          "error-callback": () => {
            setStatus("error");
            onTokenChange("");
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          onTokenChange("");
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onTokenChange, siteKey]);

  useEffect(() => {
    if (!resetKey || widgetIdRef.current === null || !window.turnstile) return;
    setStatus("loading");
    onTokenChange("");
    window.turnstile.reset(widgetIdRef.current);
  }, [onTokenChange, resetKey]);

  if (!siteKey) return null;

  return (
    <div className="w-full max-w-[380px] rounded-xl border border-sky-400/15 bg-sky-400/[0.03] px-3 py-2">
      <div ref={containerRef} className="min-h-0 w-full" />
      <p className={`text-center text-[10px] ${status === "error" ? "text-red-300" : "text-sky-200/55"}`}>
        {status === "ready"
          ? "Protection anti-robot prête"
          : status === "error"
            ? "Protection anti-robot indisponible"
            : "Vérification anti-robot en cours..."}
      </p>
    </div>
  );
}
