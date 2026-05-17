import { useState } from "react";
import { useNavigate } from "react-router-dom";

import client from "../api/client";
import ChaosFaultPicker from "../components/ChaosFaultPicker";

function NewRun() {
  const navigate = useNavigate();
  const [faults, setFaults] = useState<string[]>(["cpu"]);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleFault(fault: string) {
    setFaults((current) =>
      current.includes(fault)
        ? current.filter((entry) => entry !== fault)
        : [...current, fault]
    );
  }

  async function startRun() {
    setSubmitting(true);
    setMessage(null);

    try {
      await client.post("/api/runs/tc03/start");
      navigate("/runs/tc03");
    } catch (error) {
      setMessage("Unable to start TC-03. Check that chaos-api is running on port 4000.");
    } finally {
      setSubmitting(false);
    }
  }

  async function abortRun() {
    setSubmitting(true);
    setMessage(null);

    try {
      await client.post("/api/runs/tc03/abort");
      setMessage("Abort requested for TC-03.");
    } catch (error) {
      setMessage("Unable to abort TC-03.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">New Run</h2>
          <p className="page-subtitle">Launch the TC-03 spike + CPU chaos experiment.</p>
        </div>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Target</span>
            <select defaultValue="payment-api">
              <option value="payment-api">payment-api</option>
            </select>
          </label>

          <label className="field">
            <span>Scenario Name</span>
            <input defaultValue="TC-03 Spike + CPU" readOnly />
          </label>

          <label className="field">
            <span>Start VUs</span>
            <input defaultValue="10" readOnly type="number" />
          </label>

          <label className="field">
            <span>Peak VUs</span>
            <input defaultValue="2000" readOnly type="number" />
          </label>

          <label className="field">
            <span>CPU Fault</span>
            <input defaultValue="90% for 180s" readOnly />
          </label>
        </div>

        <div style={{ marginTop: 20 }}>
          <p className="muted">Faults</p>
          <ChaosFaultPicker onToggle={toggleFault} selectedFaults={faults} />
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button className="button" disabled={submitting} onClick={startRun} type="button">
            {submitting ? "Starting..." : "Start TC-03"}
          </button>
          <button
            className="button button-danger"
            disabled={submitting}
            onClick={abortRun}
            type="button"
          >
            Abort TC-03
          </button>
        </div>

        {message ? <p className="muted">{message}</p> : null}
      </section>
    </div>
  );
}

export default NewRun;
