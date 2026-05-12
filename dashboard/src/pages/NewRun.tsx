import { useState } from "react";

import ChaosFaultPicker from "../components/ChaosFaultPicker";

function NewRun() {
  const [faults, setFaults] = useState<string[]>(["cpu"]);

  function toggleFault(fault: string) {
    setFaults((current) =>
      current.includes(fault)
        ? current.filter((entry) => entry !== fault)
        : [...current, fault]
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">New Run</h2>
          <p className="page-subtitle">Configure a fresh experiment and ramp profile.</p>
        </div>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Target</span>
            <select defaultValue="payment-api">
              <option value="payment-api">payment-api</option>
              <option value="auth-service">auth-service</option>
            </select>
          </label>

          <label className="field">
            <span>Scenario Name</span>
            <input placeholder="Friday peak simulation" />
          </label>

          <label className="field">
            <span>Start RPS</span>
            <input defaultValue="10" type="number" />
          </label>

          <label className="field">
            <span>Peak RPS</span>
            <input defaultValue="200" type="number" />
          </label>

          <label className="field">
            <span>Ramp Seconds</span>
            <input defaultValue="30" type="number" />
          </label>
        </div>

        <div style={{ marginTop: 20 }}>
          <p className="muted">Faults</p>
          <ChaosFaultPicker onToggle={toggleFault} selectedFaults={faults} />
        </div>

        <div style={{ marginTop: 24 }}>
          <button className="button" type="button">
            Queue Run
          </button>
        </div>
      </section>
    </div>
  );
}

export default NewRun;
