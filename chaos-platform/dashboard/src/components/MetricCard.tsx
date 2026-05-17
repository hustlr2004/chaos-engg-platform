interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
}

function MetricCard({ label, value, change }: MetricCardProps) {
  return (
    <section className="panel">
      <p className="muted">{label}</p>
      <h3 className="metric-card-value">{value}</h3>
      {change ? <p className="muted">{change} vs last interval</p> : null}
    </section>
  );
}

export default MetricCard;
