import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type BeschikbaarheidStatus = "beschikbaar" | "niet_beschikbaar" | "onbekend";

interface BeschikbaarheidDotProps {
  status: BeschikbaarheidStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const config: Record<BeschikbaarheidStatus, { color: string; label: string }> = {
  beschikbaar: { color: "bg-emerald-400", label: "Beschikbaar" },
  niet_beschikbaar: { color: "bg-rose-400", label: "Niet beschikbaar" },
  onbekend: { color: "bg-slate-300 dark:bg-slate-600", label: "Onbekend" },
};

export function BeschikbaarheidDot({ status, showLabel, size = "sm" }: BeschikbaarheidDotProps) {
  const c = config[status];
  const dotSize = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">
          <span className={cn("rounded-full shrink-0", dotSize, c.color)} />
          {showLabel && status === "niet_beschikbaar" && (
            <span className="text-[10px] text-rose-600 dark:text-rose-400">niet beschikbaar</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {c.label}
      </TooltipContent>
    </Tooltip>
  );
}
