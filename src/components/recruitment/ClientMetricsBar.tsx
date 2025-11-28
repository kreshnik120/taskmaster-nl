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
          
          {/* Circular progress for Match Ready */}
          {metric.label === "Match Ready" && (
            <div className="mt-2 flex justify-center">
              <div className="h-1 w-24 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-600 ease-out ${
                    matchingPercentage >= 70 ? "bg-green-600" : matchingPercentage >= 50 ? "bg-amber-600" : "bg-destructive"
                  }`}
                  style={{ width: `${animatedMatch}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
