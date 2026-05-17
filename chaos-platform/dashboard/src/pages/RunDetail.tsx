import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import client from "../api/client";
import MetricCard from "../components/MetricCard";
import { useSocket } from "../hooks/useSocket";

type ExperimentPhase =
  | "Baseline"
  | "Load Ramp"
  | "Chaos Active"
  | "Recovery"
  | "Complete";

type LogTone = "fault" | "repair" | "warning";

interface Tc03RunState {
  status: string;
  startedAt: string | null;
  finishedAt?: string;
  exitCode?: number;
  logs: string[];
  metrics: string[];
}

interface MetricPoint {
  timestamp: number;
  logCount: number;
  errorCount: number;
}

const phaseSequence: ExperimentPhase[] = [
  "Baseline",
  "Load Ramp",
  "Chaos Active",
  "Recovery",
  "Complete",
];

function inferTone(message: string): LogTone {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("repair") ||
    normalized.includes("restart") ||
    normalized.includes("scale")
  ) {
    return "repair";
  }

  if (
    normalized.includes("fault") ||
    normalized.includes("inject") ||
    normalized.includes("k6") ||
    normalized.includes("vus")
  ) {
    return "fault";
  }

  return "warning";
}

function getPhase(run: Tc03RunState): ExperimentPhase {
  if (run.status === "passed" || run.status === "failed" || run.status === "aborted") {
    return "Complete";
  }

  if (run.logs.some((line) => line.includes("2000/2000 VUs"))) {
    return "Chaos Active";
  }

  if (run.logs.some((line) => line.toLowerCase().includes("running"))) {
    return "Load Ramp";
  }

  return run.status === "running" ? "Baseline" : "Complete";
}

function formatMetricTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    minute: "2-digit",
    second: "2-digit",
  });
}

function RunDetail() {
  const socket = useSocket("tc03");
  const [run, setRun] = useState<Tc03RunState>({
    status: "idle",
    startedAt: null,
    logs: [],
    metrics: [],
  });
  const [isAborting, setIsAborting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<MetricPoint[]>([]);

  async function refreshRun() {
    const response = await client.get("/api/runs/tc03/status");
    setRun(response.data);
  }

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await client.get("/api/runs/tc03/status");

        if (!cancelled) {
          setRun(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage("Unable to fetch TC-03 status.");
        }
      }
    }

    refresh();
    const intervalId = window.setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function handleLog(line: string) {
      setRun((current) => ({
        ...current,
        logs: [...current.logs, line],
      }));
    }

    function handleRepair(data: {
      containerName?: string;
      violationType?: string;
      action?: string;
      outcome?: string;
    }) {
      setRun((current) => ({
        ...current,
        logs: [
          ...current.logs,
          `[REPAIR] ${data.violationType || "violation"} ${data.action || "action"} on ${data.containerName || "container"} (${data.outcome || "success"})`,
        ],
      }));
    }

    socket.on("log", handleLog);
    socket.on("repair", handleRepair);

    return () => {
      socket.off("log", handleLog);
      socket.off("repair", handleRepair);
    };
  }, [socket]);

  useEffect(() => {
    setTimeline((current) =>
      [
        ...current,
        {
          timestamp: Date.now(),
          logCount: run.logs.length,
          errorCount: run.logs.filter((line) =>
            line.toLowerCase().includes("request failed")
          ).length,
        },
      ].slice(-60)
    );
  }, [run.logs.length]);

  const phase = getPhase(run);
  const latestErrors = run.logs.filter((line) =>
    line.toLowerCase().includes("request failed")
  ).length;
  const latestLogLines = run.logs.slice(-80).reverse();
  const chartData = useMemo(
    () =>
      timeline.map((point) => ({
        time: formatMetricTime(point.timestamp),
        logCount: point.logCount,
        errorCount: point.errorCount,
      })),
    [timeline]
  );

  async function abortRun() {
    setIsAborting(true);
    setMessage(null);

    try {
      await client.post("/api/runs/tc03/abort");
      await refreshRun();
      setMessage("Abort requested for TC-03.");
    } catch (error) {
      setMessage("Failed to abort TC-03.");
    } finally {
      setIsAborting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">TC-03 Live Run</h2>
          <p className="page-subtitle">
            Spike traffic, CPU injection, live k6 logs, and repair events.
          </p>
        </div>
        <button className="button button-danger" onClick={abortRun} type="button">
          {isAborting ? "Aborting..." : "ABORT RUN"}
        </button>
      </header>

      <section className="panel run-status-panel">
        <div>
          <p className="muted">Run ID</p>
          <strong>tc03</strong>
        </div>
        <div>
          <p className="muted">Status</p>
          <strong>{run.status}</strong>
        </div>
        <div>
          <p className="muted">Exit Code</p>
          <strong>{run.exitCode ?? "N/A"}</strong>
        </div>
        <div>
          <p className="muted">Current Phase</p>
          <strong>{phase}</strong>
        </div>
      </section>

      <section className="phase-track panel">
        {phaseSequence.map((phaseName) => {
          const currentIndex = phaseSequence.indexOf(phase);
          const phaseIndex = phaseSequence.indexOf(phaseName);
          const phaseClassName =
            phaseIndex < currentIndex
              ? "phase-step phase-step-complete"
              : phaseIndex === currentIndex
                ? "phase-step phase-step-active"
                : "phase-step";

          return (
            <div className={phaseClassName} key={phaseName}>
              <span>{phaseName}</span>
            </div>
          );
        })}
      </section>

      <section className="grid run-metric-grid">
        <MetricCard label="Log Lines" value={String(run.logs.length)} change="k6 + repair feed" />
        <MetricCard label="Errors" value={String(latestErrors)} change="Request failures" />
        <MetricCard label="Metric Lines" value={String(run.metrics.length)} change="k6 summary metrics" />
        <MetricCard label="Target" value="payment-api" change="CPU fault target" />
      </section>

      <section className="grid grid-2">
        <div className="panel">
          <div className="page-header">
            <div>
              <h3 className="page-title">Run Activity</h3>
              <p className="page-subtitle">Log and error growth over the current browser session.</p>
            </div>
          </div>

          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(244,239,231,0.6)" />
                <YAxis stroke="rgba(244,239,231,0.6)" />
                <Tooltip />
                <Line type="monotone" dataKey="logCount" name="Logs" stroke="#5fb2ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="errorCount" name="Errors" stroke="#ff8f5a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <section className="panel">
          <div className="page-header">
            <div>
              <h3 className="page-title">Event Feed</h3>
              <p className="page-subtitle">Latest TC-03 lines from k6 and repair events.</p>
            </div>
          </div>

          <div className="run-log-feed">
            {latestLogLines.length > 0 ? (
              latestLogLines.map((line, index) => (
                <div className={`run-log-line run-log-${inferTone(line)}`} key={`${line}-${index}`}>
                  <span className="run-log-time">{String(index + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </div>
              ))
            ) : (
              <div className="run-log-line run-log-warning">
                <span className="run-log-time">pending</span>
                <span>Waiting for TC-03 events.</span>
              </div>
            )}
          </div>
        </section>
      </section>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

export default RunDetail;
