import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import client from "../api/client";
import ContainerStatusBadge from "../components/ContainerStatusBadge";
import MetricCard from "../components/MetricCard";

interface Tc03RunState {
  status: string;
  startedAt: string | null;
  finishedAt?: string;
  exitCode?: number;
  logs: string[];
  metrics: string[];
}

const emptyRun: Tc03RunState = {
  status: "idle",
  startedAt: null,
  logs: [],
  metrics: [],
};

function formatTime(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleTimeString();
}

function Dashboard() {
  const navigate = useNavigate();
  const [run, setRun] = useState<Tc03RunState>(emptyRun);
  const [apiHealthy, setApiHealthy] = useState(false);
  const [targetHealthy, setTargetHealthy] = useState(false);
  const [prometheusReady, setPrometheusReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const [runResponse, apiResponse, targetResponse, prometheusResponse] =
        await Promise.allSettled([
          client.get("/api/runs/tc03/status"),
          client.get("/health"),
          fetch("http://localhost:5001/health"),
          fetch("http://localhost:9090/-/ready"),
        ]);

      if (cancelled) {
        return;
      }

      if (runResponse.status === "fulfilled") {
        setRun(runResponse.value.data);
      }

      setApiHealthy(apiResponse.status === "fulfilled");
      setTargetHealthy(
        targetResponse.status === "fulfilled" && targetResponse.value.ok
      );
      setPrometheusReady(
        prometheusResponse.status === "fulfilled" &&
          prometheusResponse.value.ok
      );
      setLoading(false);
    }

    refresh();
    const intervalId = window.setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const summary = useMemo(() => {
    const running = run.status === "running" ? 1 : 0;
    const totalRuns = run.startedAt ? 1 : 0;
    const passRate = run.status === "passed" ? 100 : 0;
    const latestErrors = run.logs.filter((line) =>
      line.toLowerCase().includes("request failed")
    ).length;

    return {
      running,
      totalRuns,
      passRate,
      latestErrors,
    };
  }, [run]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">ChaosLab Dashboard</h2>
          <p className="page-subtitle">
            TC-03 spike test control room for payment-api, Prometheus, and repair events.
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
        <MetricCard label="Total Runs" value={String(summary.totalRuns)} change="TC-03 session state" />
        <MetricCard label="Pass Rate" value={`${summary.passRate}%`} change="Latest run outcome" />
        <MetricCard label="Active Experiments" value={String(summary.running)} change="Running now" />
        <MetricCard label="Load Errors" value={String(summary.latestErrors)} change="k6 request failures" />
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <h3 className="page-title">Platform Health</h3>
            <p className="page-subtitle">
              Live checks against the API, target service, and Prometheus.
            </p>
          </div>
        </div>
        <div className="list">
          <div className="list-row">
            <div>
              <strong>chaos-api</strong>
              <div className="muted">http://localhost:4000</div>
            </div>
            <ContainerStatusBadge status={apiHealthy ? "healthy" : "down"} />
          </div>
          <div className="list-row">
            <div>
              <strong>payment-api</strong>
              <div className="muted">http://localhost:5001</div>
            </div>
            <ContainerStatusBadge status={targetHealthy ? "healthy" : "down"} />
          </div>
          <div className="list-row">
            <div>
              <strong>prometheus</strong>
              <div className="muted">http://localhost:9090</div>
            </div>
            <ContainerStatusBadge status={prometheusReady ? "healthy" : "down"} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <h3 className="page-title">Latest TC-03 Run</h3>
            <p className="page-subtitle">
              Status refreshes every five seconds from the chaos API.
            </p>
          </div>
          <button
            className="button table-button"
            onClick={() => navigate("/runs/tc03")}
            type="button"
          >
            View Live Run
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Target App</th>
                <th>Experiment</th>
                <th>Status</th>
                <th>Started</th>
                <th>Logs</th>
                <th>Exit Code</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>payment-api</td>
                <td>TC-03 Spike + CPU</td>
                <td>
                  <span className="status-pill">{loading ? "loading" : run.status}</span>
                </td>
                <td>{formatTime(run.startedAt)}</td>
                <td>{run.logs.length}</td>
                <td>{run.exitCode ?? "N/A"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
