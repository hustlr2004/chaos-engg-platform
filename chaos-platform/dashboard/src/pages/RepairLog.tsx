const repairs = [
  {
    container: "payment-api",
    action: "scaleOut",
    outcome: "healthy replica online",
  },
  {
    container: "auth-service",
    action: "rollback",
    outcome: "restored last known good build",
  },
  {
    container: "checkout-worker",
    action: "restartContainer",
    outcome: "recovered after memory leak",
  },
];

function RepairLog() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">Repair Log</h2>
          <p className="page-subtitle">Automated healing actions across recent incidents.</p>
        </div>
      </header>

      <section className="panel list">
        {repairs.map((repair) => (
          <div className="list-row" key={`${repair.container}-${repair.action}`}>
            <div>
              <strong>{repair.container}</strong>
              <div className="muted">{repair.outcome}</div>
            </div>
            <div>{repair.action}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default RepairLog;
