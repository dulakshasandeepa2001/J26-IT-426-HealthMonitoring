"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { fetchRegimenSuggestions, type RegimenResponse } from "./draftApi";

export function useRegimenSuggestions(visitId: string | undefined, serializedInput: string | null, knowledgeVersion: string,
  onReceived: (data: RegimenResponse) => void, onAccessDenied: (message: string) => void) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; loading: boolean; data: RegimenResponse | null; error: string | null }>({ key: "", loading: false, data: null, error: null });
  const key = JSON.stringify([visitId, serializedInput, knowledgeVersion, retry]);
  useEffect(() => {
    if (!visitId || !serializedInput) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ key, loading: true, data: null, error: null });
      try {
        const data = await fetchRegimenSuggestions(visitId, JSON.parse(serializedInput), controller.signal);
        if (controller.signal.aborted) return;
        onReceived(data);
        setState({ key, loading: false, data, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Automatic regimen suggestions could not be loaded.";
        setState({ key, loading: false, data: null, error: message });
        if (err instanceof ApiError && [401, 403].includes(err.status)) onAccessDenied(message);
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [visitId, serializedInput, knowledgeVersion, key, onReceived, onAccessDenied]);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  const current = !!serializedInput && state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null,
    loading: !!serializedInput && (!current || state.loading), refresh };
}
