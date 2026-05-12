interface ChaosFaultPickerProps {
  selectedFaults: string[];
  onToggle: (fault: string) => void;
}

const faultOptions = ["cpu", "memory", "network-latency", "packet-loss"];

function ChaosFaultPicker({
  selectedFaults,
  onToggle,
}: ChaosFaultPickerProps) {
  return (
    <div className="fault-picker">
      {faultOptions.map((fault) => {
        const selected = selectedFaults.includes(fault);

        return (
          <button
            key={fault}
            className={
              selected ? "fault-pill fault-pill-selected" : "fault-pill"
            }
            onClick={() => onToggle(fault)}
            type="button"
          >
            {fault}
          </button>
        );
      })}
    </div>
  );
}

export default ChaosFaultPicker;
