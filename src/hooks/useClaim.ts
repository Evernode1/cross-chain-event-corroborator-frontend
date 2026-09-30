import { useCallback, useEffect, useRef, useState } from "react";
import { getClaim } from "../lib/client";
import type { ClaimData } from "../lib/types";
import { isContractConfigured } from "../lib/networks";

interface UseClaimResult {
  claim: ClaimData | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 12_000;

export function useClaim(id: string | null): UseClaimResult {
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!id || !isContractConfigured) {
      setLoading(false);
      return;
    }
    try {
      const c = await getClaim(id);
      if (!mounted.current) return;
      setClaim(c);
      setNotFound(false);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      const message = e instanceof Error ? e.message : "Could not read the claim from the network.";
      if (/no claim found/i.test(message)) {
        setClaim(null);
        setNotFound(true);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setClaim(null);
    setNotFound(false);
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { claim, loading, notFound, error, refresh };
}
