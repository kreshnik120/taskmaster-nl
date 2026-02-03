import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { LucideIcon } from "lucide-react";

type KPIVariant = 
  | "count" | "success" | "time" | "urgent" | "personal" | "minimal" 
  | "facturatie" | "rose" | "violet" | "slate" | "teal" | "amber" | "blue" | "indigo";

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
  accentDot?: string;
}> = {
  count: {
    gradient: "from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60",
    borderColor: "border-t-blue-400/60",
    textColor: "text-blue-600 dark:text-blue-400",
    iconColor: "text-blue-500",
    shadowColor: "hover:shadow-blue-500/10",
    ringColor: "ring-blue-500",
    accentDot: "bg-blue-500",
  },
  success: {
    gradient: "from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background/60",
    borderColor: "border-t-green-400/60",
    textColor: "text-green-600 dark:text-green-400",
    iconColor: "text-green-500",
    shadowColor: "hover:shadow-green-500/10",
    ringColor: "ring-green-500",
    accentDot: "bg-green-500",
  },
  time: {
    gradient: "from-amber-50/80 to-white/60 dark:from-amber-950/30 dark:to-background/60",
    borderColor: "border-t-amber-400/60",
    textColor: "text-amber-600 dark:text-amber-400",
    iconColor: "text-amber-500",
    shadowColor: "hover:shadow-amber-500/10",
    ringColor: "ring-amber-500",
    accentDot: "bg-amber-500",
  },
  urgent: {
    gradient: "from-orange-50/80 to-white/60 dark:from-orange-950/30 dark:to-background/60",
    borderColor: "border-t-orange-400/60",
    textColor: "text-orange-600 dark:text-orange-400",
    iconColor: "text-orange-500",
    shadowColor: "hover:shadow-orange-500/10",
    ringColor: "ring-orange-500",
    accentDot: "bg-orange-500",
  },
  personal: {
    gradient: "from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background/60",
    borderColor: "border-t-purple-400/60",
    textColor: "text-purple-600 dark:text-purple-400",
    iconColor: "text-purple-500",
    shadowColor: "hover:shadow-purple-500/10",
    ringColor: "ring-purple-500",
    accentDot: "bg-purple-500",
  },
  minimal: {
    gradient: "",
    borderColor: "",
    textColor: "text-foreground",
    iconColor: "text-muted-foreground",
    shadowColor: "hover:shadow-md",
    ringColor: "ring-primary",
    accentDot: "bg-primary",
  },
  facturatie: {
    gradient: "from-tab-facturatie-50/80 to-white/60 dark:from-tab-facturatie-900/30 dark:to-background/60",
    borderColor: "border-t-tab-facturatie-400/60",
    textColor: "text-tab-facturatie-600 dark:text-tab-facturatie-400",
    iconColor: "text-tab-facturatie-500",
    shadowColor: "shadow-float-emerald shadow-float-emerald-hover",
    ringColor: "ring-tab-facturatie-500",
    accentDot: "bg-tab-facturatie-500",
  },
  // Context-specific variants
  rose: {
    gradient: "from-tab-recruitment-50/80 to-white/60 dark:from-tab-recruitment-900/30 dark:to-background/60",
    borderColor: "border-t-tab-recruitment-400/60",
    textColor: "text-tab-recruitment-600 dark:text-tab-recruitment-400",
    iconColor: "text-tab-recruitment-500",
    shadowColor: "shadow-float-rose shadow-float-rose-hover",
    ringColor: "ring-tab-recruitment-500",
    accentDot: "bg-tab-recruitment-500",
  },
  violet: {
    gradient: "from-tab-team-50/80 to-white/60 dark:from-tab-team-900/30 dark:to-background/60",
    borderColor: "border-t-tab-team-400/60",
    textColor: "text-tab-team-600 dark:text-tab-team-400",
    iconColor: "text-tab-team-500",
    shadowColor: "shadow-float-violet shadow-float-violet-hover",
    ringColor: "ring-tab-team-500",
    accentDot: "bg-tab-team-500",
  },
  slate: {
    gradient: "from-tab-lijst-50/80 to-white/60 dark:from-tab-lijst-900/30 dark:to-background/60",
    borderColor: "border-t-tab-lijst-400/60",
    textColor: "text-tab-lijst-600 dark:text-tab-lijst-400",
    iconColor: "text-tab-lijst-500",
    shadowColor: "shadow-float-slate shadow-float-slate-hover",
    ringColor: "ring-tab-lijst-500",
    accentDot: "bg-tab-lijst-500",
  },
  teal: {
    gradient: "from-tab-kalender-50/80 to-white/60 dark:from-tab-kalender-900/30 dark:to-background/60",
    borderColor: "border-t-tab-kalender-400/60",
    textColor: "text-tab-kalender-600 dark:text-tab-kalender-400",
    iconColor: "text-tab-kalender-500",
    shadowColor: "shadow-float-teal shadow-float-teal-hover",
    ringColor: "ring-tab-kalender-500",
    accentDot: "bg-tab-kalender-500",
  },
  amber: {
    gradient: "from-tab-opvolging-50/80 to-white/60 dark:from-tab-opvolging-900/30 dark:to-background/60",
    borderColor: "border-t-tab-opvolging-400/60",
    textColor: "text-tab-opvolging-600 dark:text-tab-opvolging-400",
    iconColor: "text-tab-opvolging-500",
    shadowColor: "shadow-float-amber shadow-float-amber-hover",
    ringColor: "ring-tab-opvolging-500",
    accentDot: "bg-tab-opvolging-500",
  },
  blue: {
    gradient: "from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60",
    borderColor: "border-t-blue-400/60",
    textColor: "text-blue-600 dark:text-blue-400",
    iconColor: "text-blue-500",
    shadowColor: "shadow-float-indigo shadow-float-indigo-hover",
    ringColor: "ring-blue-500",
    accentDot: "bg-blue-500",
  },
  indigo: {
    gradient: "from-tab-mijn-werk-50/80 to-white/60 dark:from-tab-mijn-werk-900/30 dark:to-background/60",
    borderColor: "border-t-tab-mijn-werk-400/60",
    textColor: "text-tab-mijn-werk-600 dark:text-tab-mijn-werk-400",
    iconColor: "text-tab-mijn-werk-500",
    shadowColor: "shadow-float-indigo shadow-float-indigo-hover",
    ringColor: "ring-tab-mijn-werk-500",
    accentDot: "bg-tab-mijn-werk-500",
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
  const isMinimal = variant === "minimal";

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200",
        isMinimal 
          ? "border-0 bg-background shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
          : cn(
              "glass-specular-premium glass-noise-texture",
              "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
              "border border-white/50 dark:border-white/10",
              config.borderColor,
              "border-t-4",
              // Responsive shadow: lighter on mobile, full effect on desktop
              "shadow-sm md:shadow-none",
              config.shadowColor
            ),
        onClick && "cursor-pointer glass-hover-lift",
        isActive && `ring-2 ring-offset-2 ${config.ringColor}`,
        className
      )}
      onClick={onClick}
    >
      {!isMinimal && (
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-90",
          config.gradient
        )} />
      )}
      
      <CardContent className={cn("relative", isMinimal ? "p-4" : "p-4")}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {isMinimal && config.accentDot && (
              <span className={cn("h-2 w-2 rounded-full", config.accentDot)} />
            )}
            <Icon className={cn(isMinimal ? "h-4 w-4" : "h-5 w-5", config.iconColor)} />
          </div>
        </div>
        
        <div className="space-y-1">
          <div className={cn(
            "font-bold tabular-nums",
            isMinimal ? "text-2xl text-foreground" : cn("text-3xl", config.textColor)
          )}>
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
