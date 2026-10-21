import { useEffect, useState } from 'react';

/**
 * Simulates network latency so skeleton states are visible on first paint.
 * Pass changing `deps` (e.g. a date range) to re-trigger the loading state.
 */
export function useMockLoading(ms = 450, deps: unknown[] = []) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return loading;
}
