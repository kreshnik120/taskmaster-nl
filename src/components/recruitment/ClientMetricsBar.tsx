import { useEffect, useState } from "react";
import { Building2, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ClientMetricsBarProps {
  total: number;
  abczorgCount: number;
  citozorgCount: number;
  matchingPercentage: number;
  onMetricClick?: (metric: 'total' | 'abczorg' | 'citozorg' | 'matching') => void;
}

export function ClientMetricsBar({ 
  total, 
  abczorgCount, 
  citozorgCount, 
  matchingPercentage,
  onMetricClick
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
      key: 'total' as const,
      tooltip: "Klik om alle klanten te tonen",
    },
    {
      label: "ABCzorg",
      value: animatedAbc,
      icon: Building2,
      trend: abczorgCount > citozorgCount ? "up" : null,
      color: "text-blue-600",
      key: 'abczorg' as const,
      tooltip: "Klik om ABCzorg klanten te filteren",
    },
    {
      label: "CitoZorg",
      value: animatedCito,
      icon: Building2,
      trend: citozorgCount > abczorgCount ? "up" : null,
      color: "text-orange-600",
      key: 'citozorg' as const,
      tooltip: "Klik om CitoZorg klanten te filteren",
    },
    {
      label: "Match Ready",
      value: `${animatedMatch}%`,
      icon: CheckCircle2,
      trend: matchingPercentage >= 70 ? "up" : matchingPercentage >= 50 ? null : "down",
      color: matchingPercentage >= 70 ? "text-green-600" : matchingPercentage >= 50 ? "text-amber-600" : "text-destructive",
      key: 'matching' as const,
      tooltip: "Klik om volledig ingevulde klanten te filteren",
    },
  ];

  // Define gradient and border colors per metric
  const getMetricColors = (label: string) => {
    if (label === "Totaal") return { 
      gradient: "from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60",
      border: "border-t-blue-400/60 dark:border-t-blue-500/50",
      text: "text-blue-600 dark:text-blue-400",
      shadow: "hover:shadow-blue-500/10"
    };
    if (label === "ABCzorg") return { 
      gradient: "from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60",
      border: "border-t-blue-400/60 dark:border-t-blue-500/50",
      text: "text-blue-600 dark:text-blue-400",
      shadow: "hover:shadow-blue-500/10"
    };
    if (label === "CitoZorg") return { 
      gradient: "from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background/60",
      border: "border-t-green-400/60 dark:border-t-green-500/50",
      text: "text-green-600 dark:text-green-400",
      shadow: "hover:shadow-green-500/10"
    };
    if (label === "Match Ready") {
      if (matchingPercentage >= 70) return { 
        gradient: "from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background/60",
        border: "border-t-green-400/60 dark:border-t-green-500/50",
        text: "text-green-600 dark:text-green-400",
        shadow: "hover:shadow-green-500/10"
      };
      if (matchingPercentage >= 50) return { 
        gradient: "from-amber-50/80 to-white/60 dark:from-amber-950/30 dark:to-background/60",
        border: "border-t-amber-400/60 dark:border-t-amber-500/50",
        text: "text-amber-600 dark:text-amber-400",
        shadow: "hover:shadow-amber-500/10"
      };
      return { 
        gradient: "from-red-50/80 to-white/60 dark:from-red-950/30 dark:to-background/60",
        border: "border-t-red-400/60 dark:border-t-red-500/50",
        text: "text-red-600 dark:text-red-400",
        shadow: "hover:shadow-red-500/10"
      };
    }
    return { 
      gradient: "from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60",
      border: "border-t-blue-400/60 dark:border-t-blue-500/50",
      text: "text-blue-600 dark:text-blue-400",
      shadow: "hover:shadow-blue-500/10"
    };
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((metric) => {
        const colors = getMetricColors(metric.label);
        
        return (
          <TooltipProvider key={metric.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onMetricClick?.(metric.key)}
                  className={`group flex flex-col items-center justify-center p-4 rounded-xl 
                    glass-liquid-card
                    bg-gradient-to-br ${colors.gradient}
                    backdrop-blur-xl border border-white/60 dark:border-white/15 
                    border-t-4 ${colors.border}
                    cursor-pointer`}
                >
                  <span className={`text-2xl font-bold ${colors.text}`}>
                    {metric.label === "Match Ready" ? `${animatedMatch}%` : metric.value}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                    {metric.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{metric.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}
