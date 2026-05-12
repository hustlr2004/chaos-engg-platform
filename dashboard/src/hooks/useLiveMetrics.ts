import { useEffect, useState } from "react";

export interface LiveMetric {
  name: string;
  value: string;
  delta: string;
}

const defaultMetrics: LiveMetric[] = [
  { name: "P95 Latency", value: "412ms", delta: "-8%" },
  { name: "Error Rate", value: "1.2%", delta: "-0.3%" },
  { name: "Repair Success", value: "94%", delta: "+4%" },
];

export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<LiveMetric[]>(defaultMetrics);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMetrics((currentMetrics) =>
        currentMetrics.map((metric, index) => ({
          ...metric,
          value:
            index === 0
              ? `${380 + Math.round(Math.random() * 90)}ms`
              : index === 1
                ? `${(0.8 + Math.random() * 1.2).toFixed(1)}%`
                : `${92 + Math.round(Math.random() * 6)}%`,
        }))
      );
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return metrics;
}
