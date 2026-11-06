"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { nextDelayMs, shouldRefresh } from "@/domain/live/pulse";

type LiveState = "live" | "paused" | "reconnecting";
const LABELS: Record<LiveState, string> = {
  live: "Atualização automática",
  paused: "Atualização pausada",
  reconnecting: "Reconectando dados",
};

/** Port adaptado V2: faz refresh apenas quando a marca tenant-scoped mudar. */
export function LiveRefresh() {
  const router = useRouter();
  const [state, setState] = useState<LiveState>("live");
  const previous = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let activeRequest: AbortController | null = null;
    const schedule = () => {
      if (!stopped) timer = setTimeout(() => { void tick(); }, nextDelayMs(failures));
    };
    async function tick() {
      if (stopped || running) return;
      if (document.visibilityState === "hidden") { setState("paused"); return; }
      running = true;
      activeRequest = new AbortController();
      try {
        const response = await fetch("/api/live/pulse", {
          cache: "no-store", credentials: "same-origin", signal: activeRequest.signal,
        });
        if (stopped) return;
        if (response.status === 401 || response.status === 403) {
          setState("paused");
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error("live.unavailable");
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("token" in result) ||
            typeof result.token !== "string" || !/^[0-9a-f]{24}$/.test(result.token)) {
          throw new Error("live.invalid_pulse");
        }
        if (stopped) return;
        failures = 0;
        setState("live");
        if (shouldRefresh(previous.current, result.token)) router.refresh();
        previous.current = result.token;
      } catch (error) {
        if (stopped || (error instanceof Error && error.name === "AbortError")) return;
        failures += 1;
        setState("reconnecting");
      } finally {
        running = false;
        activeRequest = null;
        if (!stopped && document.visibilityState === "visible") schedule();
      }
    }
    function onVisibility() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.visibilityState === "hidden") {
        activeRequest?.abort();
        setState("paused");
      } else if (!running) void tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      activeRequest?.abort();
    };
  }, [router]);
  return (
    <span className="fmcc-v2-live-status" data-state={state} title={LABELS[state]} aria-label={LABELS[state]}>
      <span aria-hidden="true">●</span><span>{LABELS[state]}</span>
    </span>
  );
}
