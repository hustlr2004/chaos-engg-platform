import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useParams } from "react-router-dom";

import client from "../api/client";
import MetricCard from "../components/MetricCard";
import { useSocket } from "../hooks/useSocket";
import { useRun } from "../hooks/useRun";

type ExperimentPhase =
  | "Baseline"
  | "Load Ramp"
  | "Chaos Active"
  | "Recovery"
  | "Complete";

type LogTone = "fault" | "repair" | "warning";

interface MetricPoint {
  timestamp: number;
  cpuPercent: number;
  memoryMB: number;
  reqPerSecond: number;
  errorRate: number;
}

interface LogEntry {
  id: string;
  message: string;
  tone: LogTone;
  timestamp: string;
}

const phaseSequence: ExperimentPhase[] = [
  "Baseline",
  "Load Ramp",
  "Chaos Active",
  "Recovery",
  "Complete",
];

function clampMetric(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(value, min), max);
}

function inferTone(message: string): LogTone {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("repair") ||
    normalized.includes("rollback") ||
    normalized.includes("restart") ||
    normalized.includes("scale") ||
    normalized.includes("redeploy")
  ) {
    return "repair";
  }

  if (
    normalized.includes("fault") ||
    normalized.includes("inject") ||
    normalized.includes("chaos") ||
    normalized.includes("abort")
  ) {
    return "fault";
  }

  return "warning";
}

function formatMetricTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    minute: "2-digit",
    second: "2-digit",
  });
}

function createLogEntry(message: string, tone: LogTone): LogEntry {
  return {
    id: crypto.randomUUID(),
    message,
    tone,
    timestamp: new Date().toISOString(),
  };
}

function RunDetail() {
  const { runId } = useParams();
  const { run, loading } = useRun(runId);
  const socket = useSocket("live-feed");
  const [phase, setPhase] = useState<ExperimentPhase>("Baseline");
  const [isAborting, setIsAborting] = useState(false);
  const [abortMessage, setAbortMessage] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<MetricPoint[]>([
    {
      timestamp: Date.now(),
      cpuPercent: 18,
      memoryMB: 256,
      reqPerSecond: 12,
      errorRate: 0.01,
    },
  ]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    const initialLogs =
      run?.logs?.map((entry, index) => ({
        id: `${entry.id ?? index}`,
        message: entry.message,
        tone: inferTone(entry.message),
        timestamp: entry.created_at,
      })) || [];

    setLogEntries((currentEntries) =>
      currentEntries.length > 0 ? currentEntries : initialLogs
    );
  }, [run?.logs]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function handleMetrics(payload: {
      cpuPercent?: number;
      memoryMB?: number;
      reqPerSecond?: number;
      errorRate?: number;
    }) {
      setLiveMetrics((currentPoints) => {
        const previousPoint = currentPoints[currentPoints.length - 1];
        const nextPoint: MetricPoint = {
          timestamp: Date.now(),
          cpuPercent: clampMetric(
            payload.cpuPercent ?? previousPoint?.cpuPercent ?? 0,
            0,
            100
          ),
          memoryMB: clampMetric(
            payload.memoryMB ?? previousPoint?.memoryMB ?? 0,
            0
          ),
          reqPerSecond: clampMetric(
            payload.reqPerSecond ??
              previousPoint?.reqPerSecond ??
              Math.round(10 + Math.random() * 120),
            0
          ),
          errorRate: clampMetric(
            payload.errorRate ??
              previousPoint?.errorRate ??
              Number((Math.random() * 0.08).toFixed(3)),
            0,
            1
          ),
        };

        return [...currentPoints, nextPoint].slice(-60);
      });
    }

    function handleRepair(payload: { repairAction?: string; outcome?: string }) {
      setPhase((currentPhase) =>
        currentPhase === "Complete" ? currentPhase : "Recovery"
      );
      setLogEntries((currentEntries) =>
        [
          createLogEntry(
            `Repair applied: ${payload.repairAction || "unknown"} (${payload.outcome || "success"})`,
            "repair"
          ),
          ...currentEntries,
        ].slice(0, 80)
      );
    }

    function handleLog(message: string) {
      setLogEntries((currentEntries) =>
        [
          createLogEntry(message, inferTone(message)),
          ...currentEntries,
        ].slice(0, 80)
      );

      if (message.toLowerCase().includes("baseline")) {
        setPhase("Baseline");
      } else if (message.toLowerCase().includes("ramp")) {
        setPhase("Load Ramp");
      } else if (
        message.toLowerCase().includes("fault") ||
        message.toLowerCase().includes("chaos")
      ) {
        setPhase("Chaos Active");
      } else if (message.toLowerCase().includes("recovery")) {
        setPhase("Recovery");
      } else if (message.toLowerCase().includes("complete")) {
        setPhase("Complete");
      }
    }

    socket.on("metrics", handleMetrics);
    socket.on("repair", handleRepair);
    socket.on("log", handleLog);

    return () => {
      socket.off("metrics", handleMetrics);
      socket.off("repair", handleRepair);
      socket.off("log", handleLog);
    };
  }, [socket]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLiveMetrics((currentPoints) => {
        const previousPoint = currentPoints[currentPoints.length - 1];
        const reqPerSecond = clampMetric(
          (previousPoint?.reqPerSecond || 10) + (Math.random() * 16 - 6),
          0
        );
        const cpuPercent = clampMetric(
          (previousPoint?.cpuPercent || 20) + (Math.random() * 18 - 8),
          0,
          100
        );
        const memoryMB = clampMetric(
          (previousPoint?.memoryMB || 256) + (Math.random() * 30 - 10),
          0
        );
        const errorRate = clampMetric(
          (previousPoint?.errorRate || 0.01) + (Math.random() * 0.02 - 0.008),
          0,
          0.2
        );

        return [
          ...currentPoints,
          {
            timestamp: Date.now(),
            cpuPercent: Number(cpuPercent.toFixed(1)),
            memoryMB: Number(memoryMB.toFixed(1)),
            reqPerSecond: Number(reqPerSecond.toFixed(1)),
            errorRate: Number(errorRate.toFixed(3)),
          },
        ].slice(-60);
      });
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const latestPoint = liveMetrics[liveMetrics.length - 1];
  const chartData = useMemo(
    () =>
      liveMetrics.map((point) => ({
        time: formatMetricTime(point.timestamp),
        cpuPercent: point.cpuPercent,
        memoryMB: point.memoryMB,
      })),
    [liveMetrics]
  );

  async function abortRun() {
    if (!runId) {
      return;
    }

    setIsAborting(true);
    setAbortMessage(null);

    try {
      await client.post(`/api/runs/${runId}/abort`);
      setAbortMessage("Run aborted successfully.");
      setPhase("Complete");
      setLogEntries((currentEntries) => [
        createLogEntry("Warning: run abort requested by operator", "warning"),
        ...currentEntries,
      ]);
    } catch (error) {
      setAbortMessage("Failed to abort run.");
    } finally {
      setIsAborting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">Run Detail</h2>
          <p className="page-subtitle">
            Inspect live metrics, experiment phases, and active repair decisions.
          </p>
        </div>
        <button className="button button-danger" onClick={abortRun} type="button">
          {isAborting ? "Aborting..." : "ABORT RUN"}
        </button>
      </header>

      <section className="panel run-status-panel">
        <div>
          <p className="muted">Run ID</p>
          <strong>{runId}</strong>
        </div>
        <div>
          <p className="muted">Status</p>
          <strong>{loading ? "Loading..." : run?.status || "Unknown"}</strong>
        </div>
        <div>
          <p className="muted">Outcome</p>
          <strong>{run?.outcome || "Pending"}</strong>
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
        <MetricCard
          label="CPU %"
          value={`${latestPoint?.cpuPercent.toFixed(1) || "0.0"}%`}
          change="Live from socket feed"
        />
        <MetricCard
          label="Memory MB"
          value={`${latestPoint?.memoryMB.toFixed(1) || "0.0"} MB`}
          change="Last 60 samples"
        />
        <MetricCard
          label="Req/s"
          value={`${latestPoint?.reqPerSecond.toFixed(1) || "0.0"}`}
          change="Traffic pressure"
        />
        <MetricCard
          label="Error Rate"
          value={`${((latestPoint?.errorRate || 0) * 100).toFixed(2)}%`}
          change="Failures over total"
        />
      </section>

      <section className="grid grid-2">
        <div className="panel">
          <div className="page-header">
            <div>
              <h3 className="page-title">Resource Timeline</h3>
              <p className="page-subtitle">
                CPU and memory history for the last 60 data points.
              </p>
            </div>
          </div>

          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(244,239,231,0.6)" />
                <YAxis stroke="rgba(244,239,231,0.6)" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="cpuPercent"
                  name="CPU %"
                  stroke="#ff8f5a"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="memoryMB"
                  name="Memory MB"
                  stroke="#5fb2ff"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <section className="panel">
          <div className="page-header">
            <div>
              <h3 className="page-title">Event Feed</h3>
              <p className="page-subtitle">
                Faults, repairs, and warnings streaming from the live feed.
              </p>
            </div>
          </div>

          <div className="run-log-feed">
            {logEntries.length > 0 ? (
              logEntries.map((entry) => (
                <div
                  className={`run-log-line run-log-${entry.tone}`}
                  key={entry.id}
                >
                  <span className="run-log-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))
            ) : (
              <div className="run-log-line run-log-warning">
                <span className="run-log-time">pending</span>
                <span>Waiting for live run events.</span>
              </div>
            )}
          </div>
        </section>
      </section>

      {abortMessage ? <p className="muted">{abortMessage}</p> : null}
    </div>
  );
}

export default RunDetail;
