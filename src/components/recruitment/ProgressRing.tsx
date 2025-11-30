interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({ progress, size = 32, strokeWidth = 3 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  const getColor = () => {
    if (progress === 100) return "hsl(var(--chart-2))"; // Green
    if (progress >= 80) return "hsl(var(--chart-1))"; // Blue
    return "hsl(var(--chart-3))"; // Amber
  };

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={strokeWidth}
        opacity={0.2}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getColor()}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
      {/* Percentage text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dy=".3em"
        className="transform rotate-90 text-[10px] font-semibold fill-foreground"
        style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {progress}
      </text>
    </svg>
  );
}
