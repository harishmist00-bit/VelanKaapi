import { useEffect, useRef } from "react";

/** Calls fn immediately and then every `ms`, pausing while the tab is hidden. */
export function usePolling(fn: () => void | Promise<void>, ms: number) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let stopped = false;
    const tick = () => { if (!stopped && !document.hidden) void saved.current(); };
    tick();
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [ms]);
}
