import { useCallback, useEffect, useRef, useState } from "react";
import { listAllClaims } from "../lib/client";
import type { ClaimData } from "../lib/types";
import { isContractConfigured } from "../lib/networks";

interface UseAllClaimsResult {
  /** Newest first. */
  claims: ClaimData[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 30_000;

/**
 * The contract has no "claims for this address" view, so the dashboard and explorer read the
 * whole registry (paged) and filter client-side. Fine at demo scale; a production deployment
 * would want an indexer.
 */
export function useAllClaims(): UseAllClaimsResult {
  const [claims, setClaims] = useState<ClaimData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isContractConfigured) {
      setLoading(false);
      return;
    }
    try {
      const all = await listAllClaims();
      if (!mounted.current) return;
      setClaims([...all].reverse());
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Could not load claims from the network.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { claims, loading, error, refresh };
}
