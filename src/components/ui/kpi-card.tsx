import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { LucideIcon } from "lucide-react";

type KPIVariant = "count" | "success" | "time" | "urgent" | "personal";

interface KPICardProps {
  icon: LucideIcon;
  title: string;
  value: number;
  subtitle?: string;
  suffix?: string;
  variant?: KPIVariant;
  onClick?: () => void;
  className?: string;
  isActive?: boolean;
}

const variantConfig: Record<KPIVariant, {
  gradient: string;
  borderColor: string;
  textColor: string;
  iconColor: string;
  shadowColor: string;
  ringColor: string;
}> = {
  count: {
    gradient: "from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60",
    borderColor: "border-t-blue-400/60",
    textColor: "text-blue-600 dark:text-blue-400",
    iconColor: "text-blue-500",
    shadowColor: "hover:shadow-blue-500/10",
    ringColor: "ring-blue-500",
  },
  success: {
    gradient: "from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background/60",
    borderColor: "border-t-green-400/60",
    textColor: "text-green-600 dark:text-green-400",
    iconColor: "text-green-500",
    shadowColor: "hover:shadow-green-500/10",
    ringColor: "ring-green-500",
  },
  time: {
    gradient: "from-amber-50/80 to-white/60 dark:from-amber-950/30 dark:to-background/60",
    borderColor: "border-t-amber-400/60",
    textColor: "text-amber-600 dark:text-amber-400",
    iconColor: "text-amber-500",
    shadowColor: "hover:shadow-amber-500/10",
    ringColor: "ring-amber-500",
  },
  urgent: {
    gradient: "from-orange-50/80 to-white/60 dark:from-orange-950/30 dark:to-background/60",
    borderColor: "border-t-orange-400/60",
    textColor: "text-orange-600 dark:text-orange-400",
    iconColor: "text-orange-500",
    shadowColor: "hover:shadow-orange-500/10",
    ringColor: "ring-orange-500",
  },
  personal: {
    gradient: "from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background/60",
    borderColor: "border-t-purple-400/60",
    textColor: "text-purple-600 dark:text-purple-400",
    iconColor: "text-purple-500",
    shadowColor: "hover:shadow-purple-500/10",
    ringColor: "ring-purple-500",
  },
};

export function KPICard({
  icon: Icon,
  title,
  value,
  subtitle,
  suffix,
  variant = "count",
  onClick,
  className,
  isActive = false,
}: KPICardProps) {
  const animatedValue = useCountUp({ end: value, duration: 600 });
  const config = variantConfig[variant];

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-white/50 dark:border-white/10",
        "backdrop-blur-sm transition-all duration-200",
        config.borderColor,
        "border-t-4",
        config.shadowColor,
        onClick && "cursor-pointer hover:scale-[1.02]",
        isActive && `ring-2 ring-offset-2 ${config.ringColor}`,
        className
      )}
      onClick={onClick}
    >
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-90",
        config.gradient
      )} />
      
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between mb-3">
          <Icon className={cn("h-5 w-5", config.iconColor)} />
        </div>
        
        <div className="space-y-1">
          <div className={cn("text-3xl font-bold", config.textColor)}>
            {animatedValue}{suffix}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground/80">
              {subtitle}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
