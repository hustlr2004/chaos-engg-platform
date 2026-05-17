interface LiveLogFeedProps {
  lines: string[];
}

function LiveLogFeed({ lines }: LiveLogFeedProps) {
  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h3 className="page-title">Live Feed</h3>
          <p className="page-subtitle">Runtime logs, repairs, and queue updates.</p>
        </div>
      </div>

      <div className="log-feed">
        {lines.map((line) => (
          <div className="log-line" key={line}>
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}

export default LiveLogFeed;
