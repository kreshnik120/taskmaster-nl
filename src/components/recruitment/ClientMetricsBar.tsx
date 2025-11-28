import { useEffect, useState } from "react";
import { Building2, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";

interface ClientMetricsBarProps {
  total: number;
  abczorgCount: number;
  citozorgCount: number;
  matchingPercentage: number;
}

export function ClientMetricsBar({ 
  total, 
  abczorgCount, 
  citozorgCount, 
  matchingPercentage 
}: ClientMetricsBarProps) {
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const [animatedAbc, setAnimatedAbc] = useState(0);
  const [animatedCito, setAnimatedCito] = useState(0);
  const [animatedMatch, setAnimatedMatch] = useState(0);

  // Count-up animation
  useEffect(() => {
    const duration = 600;
    const steps = 30;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const easeOut = 1 - Math.pow(1 - progress, 3);

      setAnimatedTotal(Math.round(total * easeOut));
      setAnimatedAbc(Math.round(abczorgCount * easeOut));
      setAnimatedCito(Math.round(citozorgCount * easeOut));
      setAnimatedMatch(Math.round(matchingPercentage * easeOut));

      if (currentStep >= steps) {
        clearInterval(interval);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [total, abczorgCount, citozorgCount, matchingPercentage]);

  const metrics = [
    {
      label: "Totaal",
      value: animatedTotal,
      icon: Building2,
      trend: null,
    },
    {
      label: "ABCzorg",
      value: animatedAbc,
      icon: Building2,
      trend: abczorgCount > citozorgCount ? "up" : null,
      color: "text-blue-600",
    },
    {
      label: "CitoZorg",
      value: animatedCito,
      icon: Building2,
      trend: citozorgCount > abczorgCount ? "up" : null,
      color: "text-orange-600",
    },
    {
      label: "Match Ready",
      value: `${animatedMatch}%`,
      icon: CheckCircle2,
      trend: matchingPercentage >= 70 ? "up" : matchingPercentage >= 50 ? null : "down",
      color: matchingPercentage >= 70 ? "text-green-600" : matchingPercentage >= 50 ? "text-amber-600" : "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-8 py-6 border-b border-border">
      {metrics.map((metric, index) => (
        <div key={metric.label} className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className={`text-4xl font-semibold tabular-nums ${metric.color || "text-foreground"}`}>
              {metric.value}
            </div>
            {metric.trend && (
              <span className={metric.trend === "up" ? "text-green-600" : "text-destructive"}>
                {metric.trend === "up" ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">{metric.label}</div>
          
      {/* Circular progress ring for Match Ready */}
      {metric.label === "Match Ready" && (
        <div className="mt-2 flex justify-center">
          <div className="relative inline-flex items-center justify-center">
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
                strokeDashoffset={`${2 * Math.PI * 32 * (1 - animatedMatch / 100)}`}
                className={`transition-all duration-500 ease-out ${
                  matchingPercentage >= 70 ? "text-green-600" : matchingPercentage >= 50 ? "text-amber-600" : "text-destructive"
                }`}
                strokeLinecap="round"
              />
            </svg>
            {/* Percentage text inside ring */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-semibold tabular-nums">{animatedMatch}%</span>
            </div>
          </div>
        </div>
      )}
        </div>
      ))}
    </div>
  );
}
