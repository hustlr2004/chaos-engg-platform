import ContainerStatusBadge from "../components/ContainerStatusBadge";

const targets = [
  { name: "payment-api", status: "healthy" as const, region: "ap-south-1" },
  { name: "auth-service", status: "degraded" as const, region: "ap-south-1" },
  { name: "checkout-worker", status: "down" as const, region: "eu-west-1" },
];

function Targets() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2 className="page-title">Targets</h2>
          <p className="page-subtitle">Systems currently enrolled in chaos exercises.</p>
        </div>
      </header>

      <section className="panel list">
        {targets.map((target) => (
          <div className="list-row" key={target.name}>
            <div>
              <strong>{target.name}</strong>
              <div className="muted">{target.region}</div>
            </div>
            <ContainerStatusBadge status={target.status} />
          </div>
        ))}
      </section>
    </div>
  );
}

export default Targets;
