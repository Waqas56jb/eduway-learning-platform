import { useEffect, useRef, useState } from 'react';

export interface MockConnectionOptions {
  /** Delay before the simulated drop. */
  dropAfterMs?: number;
  /** How long the simulated outage lasts. */
  outageMs?: number;
  /** Called once when the connection comes back. */
  onReconnect?: () => void;
  enabled?: boolean;
}

/**
 * Deterministic network simulation for the exam room demo: the connection drops once
 * (~25 s after mount) for ~4 s, then reconnects. Answers are local-first, so nothing is lost.
 */
export function useMockConnection({
  dropAfterMs = 25_000,
  outageMs = 4_000,
  onReconnect,
  enabled = true,
}: MockConnectionOptions = {}) {
  const [online, setOnline] = useState(true);
  const reconnectRef = useRef(onReconnect);
  useEffect(() => {
    reconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (!enabled) return;
    let restore: ReturnType<typeof setTimeout> | undefined;
    const drop = setTimeout(() => {
      setOnline(false);
      restore = setTimeout(() => {
        setOnline(true);
        reconnectRef.current?.();
      }, outageMs);
    }, dropAfterMs);
    return () => {
      clearTimeout(drop);
      if (restore) clearTimeout(restore);
    };
  }, [dropAfterMs, outageMs, enabled]);

  return { online };
}
