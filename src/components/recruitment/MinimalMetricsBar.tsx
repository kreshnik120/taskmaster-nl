import { useEffect, useState } from "react";

interface MinimalMetricsBarProps {
  totalApplications: number;
  newApplications: number;
  approvedApplications: number;
  avgCompleteness: number;
}

export function MinimalMetricsBar({ 
  totalApplications, 
  newApplications, 
  approvedApplications,
  avgCompleteness 
}: MinimalMetricsBarProps) {
  // Animated counter states
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const [animatedNew, setAnimatedNew] = useState(0);
  const [animatedApproved, setAnimatedApproved] = useState(0);
  const [animatedCompleteness, setAnimatedCompleteness] = useState(0);

  // Count-up animation on mount
  useEffect(() => {
    const duration = 600;
    const steps = 30;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const easeOut = 1 - Math.pow(1 - progress, 3);

      setAnimatedTotal(Math.round(totalApplications * easeOut));
      setAnimatedNew(Math.round(newApplications * easeOut));
      setAnimatedApproved(Math.round(approvedApplications * easeOut));
      setAnimatedCompleteness(Math.round(avgCompleteness * easeOut));

      if (currentStep >= steps) {
        clearInterval(interval);
        setAnimatedTotal(totalApplications);
        setAnimatedNew(newApplications);
        setAnimatedApproved(approvedApplications);
        setAnimatedCompleteness(avgCompleteness);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-4 gap-8 py-6 border-b">
      <div className="text-center">
        <div className="text-4xl font-semibold text-foreground mb-1 tabular-nums">
          {animatedTotal}
        </div>
        <div className="text-sm text-muted-foreground">
          Totaal
        </div>
      </div>
      
      <div className="text-center">
        <div className="text-4xl font-semibold text-blue-600 mb-1 tabular-nums">
          {animatedNew}
        </div>
        <div className="text-sm text-muted-foreground">
          Nieuw
        </div>
      </div>
      
      <div className="text-center">
        <div className="text-4xl font-semibold text-emerald-600 mb-1 tabular-nums">
          {animatedApproved}
        </div>
        <div className="text-sm text-muted-foreground">
          Goedgekeurd
        </div>
      </div>
      
      <div className="text-center">
        <div className="relative inline-flex items-center justify-center mb-1">
          {/* Circular Progress Ring */}
          <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
            {/* Background circle */}
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className="text-muted/20"
            />
            {/* Progress circle */}
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 32}`}
              strokeDashoffset={`${2 * Math.PI * 32 * (1 - animatedCompleteness / 100)}`}
              className="text-primary transition-all duration-500 ease-out"
              strokeLinecap="round"
            />
          </svg>
          {/* Percentage text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-semibold text-primary tabular-nums">{animatedCompleteness}%</span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Compleet
        </div>
      </div>
    </div>
  );
}
