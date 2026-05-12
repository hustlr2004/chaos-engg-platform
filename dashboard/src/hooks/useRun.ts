import { useEffect, useState } from "react";

import client from "../api/client";

export interface RunRecord {
  id: string;
  status: string;
  target?: string;
  outcome?: string;
  duration?: number;
  logs?: Array<{ id: string; message: string; created_at: string }>;
}

export function useRun(runId?: string) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;

    async function fetchRun() {
      setLoading(true);

      try {
        const response = await client.get(`/api/runs/${runId}`);
        if (!cancelled) {
          setRun(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          setRun(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRun();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return { run, loading };
}
