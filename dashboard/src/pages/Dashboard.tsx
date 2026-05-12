import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import client from "../api/client";
import ContainerStatusBadge from "../components/ContainerStatusBadge";
import MetricCard from "../components/MetricCard";

type RunStatus = "passed" | "failed" | "running" | "queued" | "aborted";

type HealthStatus = "healthy" | "degraded" | "down";

interface RunSummary {
  id: string;
  target?: string;
  targetApp?: string;
  experiment?: string;
  status: RunStatus | string;
  duration?: number | null;
  faultsInjected?: string[] | string | null;
  autoRepaired?: boolean | null;
  outcome?: string | null;
}

interface TargetApp {
  id?: string;
  name?: string;
  displayName?: string;
  appName?: string;
  baseUrl?: string;
  url?: string;
  healthUrl?: string;
}

interface DashboardSummary {
  totalRuns: number;
  passRate: number;
  avgRecoveryTimeMs: number;
  activeExperiments: number;
}

const emptySummary: DashboardSummary = {
  totalRuns: 0,
  passRate: 0,
  avgRecoveryTimeMs: 0,
  activeExperiments: 0,
};

function normalizeStatus(status: string): RunStatus | "unknown" {
  const normalized = status.toLowerCase();

  if (
    normalized === "passed" ||
    normalized === "failed" ||
    normalized === "running" ||
    normalized === "queued" ||
    normalized === "aborted"
  ) {
    return normalized;
  }

  return "unknown";
}

function formatDuration(duration?: number | null) {
  if (!duration || Number.isNaN(duration)) {
    return "N/A";
  }

  if (duration < 1000) {
    return `${Math.round(duration)} ms`;
  }

  return `${(duration / 1000).toFixed(1)} s`;
}

function deriveHealthStatus(healthy: boolean | null, statusCode?: number) {
  if (healthy === true || statusCode === 200) {
    return "healthy";
  }

  if (statusCode && statusCode < 500) {
    return "degraded";
  }

  return "down";
}

function getTargetName(target: TargetApp) {
  return target.displayName || target.appName || target.name || target.id || "Unknown";
}

function getTargetHealthUrl(target: TargetApp) {
  if (target.healthUrl) {
    return target.healthUrl;
  }

  const baseUrl = target.baseUrl || target.url;

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}/health`;
}

function getRunFaults(run: RunSummary) {
  if (Array.isArray(run.faultsInjected)) {
    return run.faultsInjected.join(", ");
  }

  if (typeof run.faultsInjected === "string" && run.faultsInjected.length > 0) {
    return run.faultsInjected;
  }

  return "N/A";
}

function getExperimentName(run: RunSummary) {
  return run.experiment || "Standard Chaos Run";
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);
  const className =
    normalized === "passed"
      ? "status-pill status-pill-passed"
      : normalized === "failed" || normalized === "aborted"
        ? "status-pill status-pill-failed"
        : normalized === "running" || normalized === "queued"
          ? "status-pill status-pill-running"
          : "status-pill";

  return <span className={className}>{status}</span>;
}

function Dashboard() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [targets, setTargets] = useState<TargetApp[]>([]);
  const [healthByTarget, setHealthByTarget] = useState<Record<string, HealthStatus>>(
    {}
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboardData() {
      try {
        const [runsResponse, targetsResponse] = await Promise.allSettled([
          client.get("/api/runs"),
          client.get("/api/targets"),
        ]);

        if (cancelled) {
          return;
        }

        if (runsResponse.status === "fulfilled") {
          setRuns(Array.isArray(runsResponse.value.data) ? runsResponse.value.data : []);
        }

        if (targetsResponse.status === "fulfilled") {
          const payload = targetsResponse.value.data;
          const targetItems = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
              ? payload.items
              : [];
          setTargets(targetItems);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDashboardData();
    const intervalId = window.setInterval(fetchDashboardData, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollTargetHealth() {
      if (!targets.length) {
        return;
      }

      const updates = await Promise.all(
        targets.map(async (target) => {
          const targetName = getTargetName(target);
          const healthUrl = getTargetHealthUrl(target);

          if (!healthUrl) {
            return [targetName, "degraded"] as const;
          }

          try {
            const response = await fetch(healthUrl, {
              method: "GET",
            });

            return [
              targetName,
              deriveHealthStatus(response.ok, response.status),
            ] as const;
          } catch (error) {
            return [targetName, "down"] as const;
          }
        })
      );

      if (!cancelled) {
        setHealthByTarget(Object.fromEntries(updates));
      }
    }

    pollTargetHealth();
    const intervalId = window.setInterval(pollTargetHealth, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [targets]);

  const summary = useMemo<DashboardSummary>(() => {
    if (!runs.length) {
      return emptySummary;
    }

    const passedRuns = runs.filter(
      (run) => normalizeStatus(run.status) === "passed"
    ).length;
    const activeExperiments = runs.filter((run) => {
      const status = normalizeStatus(run.status);
      return status === "running" || status === "queued";
    }).length;
    const durations = runs
      .map((run) => run.duration)
      .filter((value): value is number => Number.isFinite(value ?? NaN));
    const avgRecoveryTimeMs = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;

    return {
      totalRuns: runs.length,
      passRate: (passedRuns / runs.length) * 100,
      avgRecoveryTimeMs,
      activeExperiments,
    };
  }, [runs]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">System Dashboard</h2>
          <p className="page-subtitle">
            Overview of recent chaos runs, auto-repair outcomes, and target health.
          </p>
        </div>
        <button
          className="button"
          onClick={() => navigate("/runs/new")}
          type="button"
        >
          New Chaos Run
        </button>
      </header>

      <section className="grid run-metric-grid">
        <MetricCard
          label="Total Runs"
          value={String(summary.totalRuns)}
          change="Latest 50 executions"
        />
        <MetricCard
          label="Pass Rate"
          value={`${summary.passRate.toFixed(1)}%`}
          change="Across recent runs"
        />
        <MetricCard
          label="Avg Recovery Time"
          value={formatDuration(summary.avgRecoveryTimeMs)}
          change="Mean run duration"
        />
        <MetricCard
          label="Active Experiments"
          value={String(summary.activeExperiments)}
          change="Running or queued"
        />
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <h3 className="page-title">Recent Runs</h3>
            <p className="page-subtitle">
              Auto-refreshes every 15 seconds from the chaos API.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Target App</th>
                <th>Experiment</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Faults Injected</th>
                <th>Auto-repaired</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.length > 0 ? (
                runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.targetApp || run.target || "Unknown"}</td>
                    <td>{getExperimentName(run)}</td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td>{formatDuration(run.duration)}</td>
                    <td>{getRunFaults(run)}</td>
                    <td>{run.autoRepaired ? "Yes" : "No"}</td>
                    <td>
                      <button
                        className="button table-button"
                        onClick={() => navigate(`/runs/${run.id}`)}
                        type="button"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-empty" colSpan={7}>
                    {loading
                      ? "Loading recent runs..."
                      : "No runs available from the chaos API yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <h3 className="page-title">Registered Target Apps</h3>
            <p className="page-subtitle">
              Health checks refresh every 10 seconds using each target&apos;s
              `/health` endpoint.
            </p>
          </div>
        </div>

        <div className="list">
          {targets.length > 0 ? (
            targets.map((target) => {
              const targetName = getTargetName(target);
              const healthStatus = healthByTarget[targetName] || "degraded";

              return (
                <div className="list-row" key={targetName}>
                  <div>
                    <strong>{targetName}</strong>
                    <div className="muted">
                      {getTargetHealthUrl(target) || "No health URL configured"}
                    </div>
                  </div>
                  <ContainerStatusBadge status={healthStatus} />
                </div>
              );
            })
          ) : (
            <div className="list-row">
              <div className="muted">
                {loading
                  ? "Loading registered targets..."
                  : "No registered target apps available."}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
