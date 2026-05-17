type ContainerStatus = "healthy" | "degraded" | "down";

interface ContainerStatusBadgeProps {
  status: ContainerStatus;
}

function ContainerStatusBadge({ status }: ContainerStatusBadgeProps) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`badge badge-${status}`}>
      {label}
    </span>
  );
}

export default ContainerStatusBadge;
