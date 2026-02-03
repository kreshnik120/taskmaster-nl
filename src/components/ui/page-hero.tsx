import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ContextColor = "slate" | "rose" | "violet" | "teal" | "amber" | "emerald" | "indigo" | "blue";

interface PageHeroProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  contextColor?: ContextColor;
  badge?: { label: string; variant?: "default" | "secondary" | "destructive" | "outline" };
  children?: ReactNode;
  className?: string;
}

const colorToIconClass: Record<ContextColor, string> = {
  slate: "text-tab-lijst-500",
  rose: "text-tab-recruitment-500",
  violet: "text-tab-team-500",
  teal: "text-tab-kalender-500",
  amber: "text-tab-opvolging-500",
  emerald: "text-tab-facturatie-500",
  indigo: "text-tab-mijn-werk-500",
  blue: "text-info",
};

export function PageHero({ 
  title, 
  subtitle, 
  icon: Icon,
  contextColor,
  badge,
  children, 
  className 
}: PageHeroProps) {
  const iconColorClass = contextColor 
    ? colorToIconClass[contextColor]
    : "text-muted-foreground";

  return (
    <div className={cn("space-y-1 mb-8", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={cn(
                "p-2 rounded-xl",
                "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
                "border border-white/40 dark:border-white/10",
                "glass-inner-glow-3layer"
              )}>
                <Icon className={cn("h-5 w-5", iconColorClass)} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold heading-lg">
                {title}
              </h1>
              {badge && (
                <Badge variant={badge.variant || "secondary"}>
                  {badge.label}
                </Badge>
              )}
            </div>
          </div>
          {subtitle && (
            <p className={cn(
              "text-sm text-muted-foreground/80 body-default",
              Icon && "pl-[52px]"
            )}>
              {subtitle}
            </p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
